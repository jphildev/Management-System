const mongoose = require('mongoose');

// [API-03] users collection
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 255,
    },
    // Stores the bcrypt hash, never the plain password.
    // maxlength 255 is the MongoDB equivalent of VARCHAR(255).
    password: { type: String, required: true, maxlength: 255, select: false },
    // Defaults to "user"; only ever set by an admin, never from request bodies.
    role: { type: String, default: 'user' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
