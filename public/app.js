// CodeAlpha Full Stack Internship - Task 4: Real-Time Communication App
// Student: Redeemer Jerrey Kow Williams (CA/DF1/320453)

class NexusMeetApp {
  constructor() {
    this.socket = io();
    this.localStream = null;
    this.screenStream = null;
    this.peers = new Map(); // socketId -> { peerConnection, name, element }
    this.roomId = null;
    this.userName = 'Redeemer Williams';
    this.isMuted = false;
    this.isVideoOff = false;
    this.isSharingScreen = false;
    this.callStartTime = null;
    this.clockInterval = null;

    // Whiteboard state
    this.isDrawing = false;
    this.isEraser = false;
    this.currentX = 0;
    this.currentY = 0;
    this.canvas = null;
    this.ctx = null;

    this.sharedFiles = [];

    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this.init();
  }

  init() {
    this.setupSocketSignaling();
    this.setupWhiteboardCanvas();
  }

  generateRandomRoom() {
    const code = 'meet-' + Math.random().toString(36).substring(2, 7);
    document.getElementById('roomInput').value = code;
  }

  // ---------------- LOBBY & JOINING ----------------
  async joinMeeting() {
    this.userName = document.getElementById('userNameInput').value.trim() || 'Guest';
    this.roomId = document.getElementById('roomInput').value.trim() || 'alpha-standup';

    document.getElementById('localUserLabel').textContent = `${this.userName} (You)`;
    document.getElementById('activeRoomCode').textContent = this.roomId;

    try {
      // Access camera and microphone
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (mediaErr) {
        console.warn('Could not acquire real camera/mic, fallback to simulated stream:', mediaErr);
        this.localStream = this.createSimulatedStream();
        this.showToast('Running in test/simulated media stream mode.', 'info');
      }

      const localVideo = document.getElementById('localVideo');
      localVideo.srcObject = this.localStream;

      document.getElementById('lobbyView').style.display = 'none';
      document.getElementById('meetingView').style.display = 'grid';

      this.startClock();

      // Join room via Socket.io
      this.socket.emit('join-room', { roomId: this.roomId, name: this.userName });

      this.showToast(`Joined room: ${this.roomId}`, 'success');
    } catch (err) {
      alert('Media stream error: ' + err.message);
    }
  }

  createSimulatedStream() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    let frame = 0;

    const timer = setInterval(() => {
      frame++;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(320, 180, 50 + Math.sin(frame * 0.1) * 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '22px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(this.userName, 320, 185);
      ctx.font = '14px Arial';
      ctx.fillText('Live WebRTC Media', 320, 215);
    }, 100);

    const stream = canvas.captureStream(25);
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const dst = osc.connect(audioCtx.createMediaStreamDestination());
    osc.start();
    const audioTrack = dst.stream.getAudioTracks()[0];
    if (audioTrack) stream.addTrack(audioTrack);
    return stream;
  }

  // ---------------- WEBRTC SIGNALING ----------------
  setupSocketSignaling() {
    // 1. Existing users in the room
    this.socket.on('all-users', ({ users }) => {
      users.forEach(userId => {
        const pc = this.createPeerConnection(userId);
        this.peers.set(userId, { pc, name: 'Participant' });

        this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));

        pc.createOffer().then(offer => {
          return pc.setLocalDescription(offer);
        }).then(() => {
          this.socket.emit('sending-signal', {
            userToSignal: userId,
            callerId: this.socket.id,
            signal: pc.localDescription
          });
        }).catch(console.error);
      });
    });

    // 2. Incoming peer offer
    this.socket.on('user-joined-signal', ({ signal, callerId, name }) => {
      const pc = this.createPeerConnection(callerId);
      this.peers.set(callerId, { pc, name: name || 'Participant' });

      this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));

      pc.setRemoteDescription(new RTCSessionDescription(signal)).then(() => {
        return pc.createAnswer();
      }).then(answer => {
        return pc.setLocalDescription(answer);
      }).then(() => {
        this.socket.emit('returning-signal', {
          callerId,
          signal: pc.localDescription
        });
      }).catch(console.error);

      this.showToast(`${name || 'A user'} joined the meeting.`);
    });

    // 3. Returned answer
    this.socket.on('receiving-returned-signal', ({ signal, id }) => {
      const peer = this.peers.get(id);
      if (peer && peer.pc) {
        peer.pc.setRemoteDescription(new RTCSessionDescription(signal)).catch(console.error);
      }
    });

    // 4. ICE Candidates
    this.socket.on('ice-candidate', ({ candidate, sender }) => {
      const peer = this.peers.get(sender);
      if (peer && peer.pc) {
        peer.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      }
    });

    // 5. User Disconnected
    this.socket.on('user-disconnected', ({ socketId, name }) => {
      if (this.peers.has(socketId)) {
        const p = this.peers.get(socketId);
        if (p.element) p.element.remove();
        if (p.pc) p.pc.close();
        this.peers.delete(socketId);
        this.showToast(`${name || 'A participant'} left the meeting.`);
      }
    });

    // Whiteboard socket listeners
    this.socket.on('whiteboard-draw', (data) => this.drawRemoteStroke(data));
    this.socket.on('whiteboard-clear', () => this.clearCanvasLocal());

    // Chat socket listeners
    this.socket.on('chat-message', (data) => this.renderIncomingMessage(data));

    // File sharing socket listeners
    this.socket.on('file-received', (data) => this.renderIncomingFile(data));
  }

  createPeerConnection(targetUserId) {
    const pc = new RTCPeerConnection(this.rtcConfig);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('ice-candidate', {
          target: targetUserId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      const peerObj = this.peers.get(targetUserId);
      if (peerObj && !peerObj.element) {
        const remoteCard = document.createElement('div');
        remoteCard.className = 'video-card remote-card';
        remoteCard.id = `remote-${targetUserId}`;

        const remoteVideo = document.createElement('video');
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.srcObject = event.streams[0];

        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        overlay.innerHTML = `<span class="user-label">${peerObj.name || 'Participant'}</span>`;

        remoteCard.appendChild(remoteVideo);
        remoteCard.appendChild(overlay);
        document.getElementById('videosGrid').appendChild(remoteCard);

        peerObj.element = remoteCard;
      }
    };

    return pc;
  }

  // ---------------- MEDIA CONTROLS ----------------
  toggleMic() {
    this.isMuted = !this.isMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => t.enabled = !this.isMuted);
    }
    const btn = document.getElementById('btnToggleMic');
    btn.classList.toggle('off', this.isMuted);
    btn.innerHTML = `<i class="fa-solid fa-microphone${this.isMuted ? '-slash' : ''}"></i>`;
    document.getElementById('localMicIndicator').className = this.isMuted ? 'muted' : '';
    this.showToast(this.isMuted ? 'Microphone muted' : 'Microphone unmuted');
  }

  toggleCam() {
    this.isVideoOff = !this.isVideoOff;
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(t => t.enabled = !this.isVideoOff);
    }
    const btn = document.getElementById('btnToggleCam');
    btn.classList.toggle('off', this.isVideoOff);
    btn.innerHTML = `<i class="fa-solid fa-video${this.isVideoOff ? '-slash' : ''}"></i>`;
    document.getElementById('localCamIndicator').className = this.isVideoOff ? 'muted' : '';
    this.showToast(this.isVideoOff ? 'Camera turned off' : 'Camera turned on');
  }

  async toggleScreenShare() {
    const btn = document.getElementById('btnShareScreen');

    if (!this.isSharingScreen) {
      try {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = this.screenStream.getVideoTracks()[0];

        // Replace track on all peer connections
        this.peers.forEach(peer => {
          const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        });

        document.getElementById('localVideo').srcObject = this.screenStream;
        this.isSharingScreen = true;
        btn.classList.add('active');

        screenTrack.onended = () => this.stopScreenShare();
        this.showToast('Screen sharing started', 'success');
      } catch (err) {
        this.showToast('Screen share cancelled or not supported.');
      }
    } else {
      this.stopScreenShare();
    }
  }

  stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
    }
    const videoTrack = this.localStream.getVideoTracks()[0];
    this.peers.forEach(peer => {
      const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(videoTrack);
    });

    document.getElementById('localVideo').srcObject = this.localStream;
    this.isSharingScreen = false;
    document.getElementById('btnShareScreen').classList.remove('active');
    this.showToast('Stopped sharing screen');
  }

  leaveMeeting() {
    if (confirm('Are you sure you want to exit this call?')) {
      if (this.localStream) this.localStream.getTracks().forEach(t => t.stop());
      if (this.screenStream) this.screenStream.getTracks().forEach(t => t.stop());

      this.peers.forEach(p => {
        if (p.pc) p.pc.close();
      });
      this.peers.clear();

      clearInterval(this.clockInterval);
      window.location.reload();
    }
  }

  // ---------------- COLLABORATIVE WHITEBOARD ----------------
  setupWhiteboardCanvas() {
    this.canvas = document.getElementById('whiteboardCanvas');
    this.ctx = this.canvas.getContext('2d');

    const resize = () => {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
      }
    };

    window.addEventListener('resize', resize);
    setTimeout(resize, 200);

    // Mouse Listeners
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    this.canvas.addEventListener('mouseup', () => this.stopDrawing());
    this.canvas.addEventListener('mouseleave', () => this.stopDrawing());
  }

  toggleWhiteboard(show) {
    const overlay = document.getElementById('whiteboardOverlay');
    const isVisible = show !== undefined ? show : overlay.style.display === 'none';
    overlay.style.display = isVisible ? 'flex' : 'none';
    document.getElementById('btnToggleWhiteboard').classList.toggle('active', isVisible);

    if (isVisible) {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }
  }

  toggleEraser() {
    this.isEraser = !this.isEraser;
    const btn = document.getElementById('wbEraserBtn');
    btn.classList.toggle('active', this.isEraser);
    btn.innerHTML = `<i class="fa-solid fa-eraser"></i> ${this.isEraser ? 'Pen Tool' : 'Eraser'}`;
  }

  startDrawing(e) {
    this.isDrawing = true;
    const rect = this.canvas.getBoundingClientRect();
    this.currentX = e.clientX - rect.left;
    this.currentY = e.clientY - rect.top;
  }

  draw(e) {
    if (!this.isDrawing) return;
    const rect = this.canvas.getBoundingClientRect();
    const newX = e.clientX - rect.left;
    const newY = e.clientY - rect.top;

    const strokeColor = this.isEraser ? '#ffffff' : document.getElementById('wbColor').value;
    const lineWidth = parseInt(document.getElementById('wbBrushSize').value) || 5;

    this.ctx.beginPath();
    this.ctx.moveTo(this.currentX, this.currentY);
    this.ctx.lineTo(newX, newY);
    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = this.isEraser ? lineWidth * 2.5 : lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.stroke();

    // Broadcast stroke to room
    this.socket.emit('whiteboard-draw', {
      x0: this.currentX / this.canvas.width,
      y0: this.currentY / this.canvas.height,
      x1: newX / this.canvas.width,
      y1: newY / this.canvas.height,
      color: strokeColor,
      size: this.isEraser ? lineWidth * 2.5 : lineWidth
    });

    this.currentX = newX;
    this.currentY = newY;
  }

  stopDrawing() {
    this.isDrawing = false;
  }

  drawRemoteStroke(data) {
    if (!this.canvas) return;
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.ctx.beginPath();
    this.ctx.moveTo(data.x0 * w, data.y0 * h);
    this.ctx.lineTo(data.x1 * w, data.y1 * h);
    this.ctx.strokeStyle = data.color;
    this.ctx.lineWidth = data.size;
    this.ctx.lineCap = 'round';
    this.ctx.stroke();
  }

  clearWhiteboard() {
    this.clearCanvasLocal();
    this.socket.emit('whiteboard-clear');
  }

  clearCanvasLocal() {
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  downloadWhiteboard() {
    const link = document.createElement('a');
    link.download = `nexus-whiteboard-${Date.now()}.png`;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
    this.showToast('Whiteboard saved to downloads.');
  }

  // ---------------- CHAT & FILES SIDEBAR ----------------
  toggleSidebar(show) {
    const sidebar = document.getElementById('meetingSidebar');
    const isVisible = show !== undefined ? show : sidebar.style.display === 'none';
    sidebar.style.display = isVisible ? 'flex' : 'none';
    document.getElementById('btnToggleChat').classList.toggle('active', isVisible);
  }

  switchSidebarTab(tab) {
    document.getElementById('tabChat').classList.toggle('active', tab === 'chat');
    document.getElementById('tabFiles').classList.toggle('active', tab === 'files');
    document.getElementById('paneChat').classList.toggle('active', tab === 'chat');
    document.getElementById('paneFiles').classList.toggle('active', tab === 'files');
  }

  sendChatMessage(e) {
    e.preventDefault();
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    this.socket.emit('chat-message', { text });
    input.value = '';
  }

  renderIncomingMessage(msg) {
    const container = document.getElementById('chatMessages');
    const card = document.createElement('div');
    card.className = 'chat-msg';
    card.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-sender">${this.escape(msg.sender)}</span>
        <span class="chat-time">${msg.time}</span>
      </div>
      <div>${this.escape(msg.text)}</div>
    `;
    container.appendChild(card);
    container.scrollTop = container.scrollHeight;
  }

  handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      alert('File exceeds 50MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.socket.emit('file-share', {
        fileName: file.name,
        fileSize: this.formatBytes(file.size),
        fileType: file.type,
        fileData: reader.result
      });

      this.renderIncomingFile({
        sender: 'You',
        fileName: file.name,
        fileSize: this.formatBytes(file.size),
        fileData: reader.result
      });

      this.showToast(`Shared "${file.name}" with room.`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  renderIncomingFile(data) {
    this.sharedFiles.push(data);
    document.getElementById('sharedFilesCount').textContent = this.sharedFiles.length;

    const list = document.getElementById('sharedFilesList');
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <i class="fa-regular fa-file-lines"></i>
      <div class="file-item-info">
        <div class="file-name" title="${data.fileName}">${this.escape(data.fileName)}</div>
        <div class="file-meta">Shared by ${this.escape(data.sender)} • ${data.fileSize}</div>
      </div>
      <a href="${data.fileData}" download="${data.fileName}" class="btn btn-outline btn-sm" title="Download">
        <i class="fa-solid fa-download"></i>
      </a>
    `;
    list.appendChild(item);
  }

  // Clock
  startClock() {
    this.callStartTime = Date.now();
    this.clockInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      document.getElementById('callClock').textContent = `${mins}:${secs}`;
    }, 1000);
  }

  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  escape(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  showToast(msg, type = 'info') {
    const box = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    box.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }
}

const rtcApp = new NexusMeetApp();

