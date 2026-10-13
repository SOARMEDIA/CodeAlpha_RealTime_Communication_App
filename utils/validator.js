module.exports = {
  isEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  isNonEmpty: (str) => typeof str === "string" && str.trim().length > 0
};
