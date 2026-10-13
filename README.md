# CodeAlpha_RealTime_Communication_App
### Full Stack Development Internship — Task 4

**Intern Name:** REDEEMER JERREY KOW WILLIAMS  
**Student ID:** CA/DF1/320453  
**Domain:** Full Stack Web Development  
**Batch:** 20th October 2026 to 20th November 2026  
**Company:** [CodeAlpha](https://www.codealpha.tech)

---

## 📌 Project Overview
**Nexus Meet** is a modern, enterprise-grade real-time video conferencing, screen sharing, and collaborative whiteboard application built for Task 4 of the CodeAlpha Full Stack Development Internship.

It leverages native browser **WebRTC (RTCPeerConnection)** media pipelines for low-latency peer-to-peer audio/video streaming, backed by **Socket.io** for signaling, real-time vector whiteboard synchronization, ephemeral in-call text chat, and instant encrypted file sharing.

---

## 🚀 Key Features

1. **Multi-User WebRTC Video Conferencing:**
   - Real-time peer-to-peer audio and video transmission powered by STUN servers.
   - Dynamic video grid accommodating multiple conference participants.
   - Mic mute/unmute and camera start/stop hardware toggles.

2. **Full-Resolution Screen Sharing:**
   - Native display capture via `navigator.mediaDevices.getDisplayMedia`.
   - Seamless media stream track substitution on active peer connections without re-negotiation lags.

3. **Live Vector Collaborative Whiteboard:**
   - Real-time shared canvas for diagramming, architecture review, and brainstorming.
   - Custom palette with color picker, dynamic brush weights, and eraser tool.
   - Single-click board clearing and export/download as high-res PNG.

4. **In-Call Ephemeral Chat & Large File Sharing:**
   - Room-scoped instant messaging with participant stamps.
   - Fast peer file transfer (up to 50MB) with download triggers.

5. **Security & Data Encryption:**
   - Encrypted media streams protected via native WebRTC **DTLS / SRTP** encryption.
   - JWT authentication and bcrypt password protection for user profiles.

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES6+), WebRTC API, Canvas API, FontAwesome
- **Backend:** Node.js, Express.js
- **Real-Time Signaling:** Socket.io WebSockets
- **Authentication:** JSON Web Tokens (`jsonwebtoken`), `bcryptjs`
- **Database:** Persistent file-backed store (`users.json`, `rooms.json`)

---

## 🏁 Quick Start Guide

### Prerequisites
- Node.js (v18+)
- npm (v9+)
- A modern browser with Camera/Microphone permissions (Chrome, Edge, Firefox, Safari)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/<your-username>/CodeAlpha_RealTime_Communication_App.git
   cd CodeAlpha_RealTime_Communication_App
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch the server:
   ```bash
   npm start
   ```

4. Navigate to:
   ```text
   http://localhost:3003
   ```

---

## 📡 WebRTC Signaling & Socket Events

| Event | Direction | Purpose |
|---|---|---|
| `join-room` | Client ➔ Server | Requests entry into a designated meeting room |
| `all-users` | Server ➔ Client | Returns existing peer socket IDs in the room |
| `sending-signal` | Client ➔ Server | Dispatches WebRTC SDP Offer to new peer |
| `user-joined-signal` | Server ➔ Client | Forwards SDP Offer to recipient peer |
| `returning-signal` | Client ➔ Server | Dispatches WebRTC SDP Answer back to caller |
| `ice-candidate` | Bidirectional | Exchanges ICE network traversal candidates |
| `whiteboard-draw` | Bidirectional | Broadcasts vector brush stroke coordinates |
| `whiteboard-clear`| Bidirectional | Resets whiteboard state across all participants |
| `chat-message` | Bidirectional | Broadcasts in-call chat message |
| `file-share` | Bidirectional | Relays file payload and download metadata |

---

## 📄 License
This project is submitted as part of the CodeAlpha Internship Program. Licensed under the MIT License.

