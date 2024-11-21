const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {}; // Track users in rooms

// Serve static files from the "public" directory
app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log(`Socket ID ${socket.id} connected.`);

  // Handle joining a room
  socket.on('joinRoom', (roomKey) => {
    console.log(`Socket ID ${socket.id} attempting to join room: ${roomKey}`);

    // Initialize room if it doesn't exist
    if (!rooms[roomKey]) {
      rooms[roomKey] = [];
    }

    // Prevent duplicate entries
    if (!rooms[roomKey].includes(socket.id)) {
      rooms[roomKey].push(socket.id);
      socket.join(roomKey); // Join the room in Socket.IO
    }

    console.log(`Users in room ${roomKey}:`, rooms[roomKey]);

    // Notify the joining user
    socket.emit('joinedRoom', `Socket ID ${socket.id} joined room: ${roomKey}`);

    // Notify other users in the room of the new user
    socket.to(roomKey).emit('newUser', `Socket ID ${socket.id} joined room: ${roomKey}`);
  });

  // Handle messaging
  socket.on('chatMessage', ({ message, roomKey }) => {
    console.log(`Message from Socket ID ${socket.id} in room ${roomKey}: ${message}`);
    // Check if the socket is still in the room
    if (rooms[roomKey] && rooms[roomKey].includes(socket.id)) {
      socket.to(roomKey).emit('chatMessage', { message, sender: socket.id });
    }
  });

  // Handle WebRTC offer
  socket.on('offer', (data) => {
    const { offer, roomKey } = data;

    // Validate the offer object
    if (!offer || !offer.sdp) {
      console.error('Invalid offer received:', offer);
      socket.emit('error', { message: 'Invalid offer received.' });
      return;
    }

    console.log(`Received offer from ${socket.id} for room ${roomKey}`);

    // Forward the offer to other users in the room
    socket.to(roomKey).emit('offer', { type: 'offer', sdp: offer.sdp, sender: socket.id });
  });

  // Handle WebRTC answer
  socket.on('answer', (data) => {
    const { answer, roomKey } = data;

    // Validate the answer object
    if (!answer || !answer.sdp) {
      console.error('Invalid answer received:', answer);
      socket.emit('error', { message: 'Invalid answer received.' });
      return;
    }

    console.log(`Received answer from ${socket.id} for room ${roomKey}`);

    // Forward the answer to the user who sent the offer
    socket.to(roomKey).emit('answer', { type: 'answer', sdp: answer.sdp, sender: socket.id });
  });

  // Handle ICE candidates
  socket.on('candidate', (data) => {
    const { candidate, roomKey } = data;

    // Validate the candidate object
    if (!candidate) {
      console.error('Invalid candidate received:', candidate);
      socket.emit('error', { message: 'Invalid candidate received.' });
      return;
    }

    console.log(`Received ICE candidate from ${socket.id} for room ${roomKey}`);

    // Forward the ICE candidate to the other users in the room
    socket.to(roomKey).emit('candidate', { candidate, sender: socket.id });
  });

  // Handle leaving the call (e.g., when "End Call" is pressed)
  socket.on('leaveRoom', (roomKey) => {
    console.log(`Socket ID ${socket.id} is leaving room: ${roomKey}`);

    if (rooms[roomKey]) {
      // Remove the socket ID from the room
      rooms[roomKey] = rooms[roomKey].filter((id) => id !== socket.id);

      // Notify others in the room
      socket.to(roomKey).emit('userLeft', `Socket ID ${socket.id} left the room: ${roomKey}`);

      // Leave the room in Socket.IO
      socket.leave(roomKey);

      // If the room is empty, delete it
      if (rooms[roomKey].length === 0) {
        delete rooms[roomKey];
        console.log(`Room ${roomKey} is empty and has been deleted.`);
      } else {
        console.log(`Updated room ${roomKey}:`, rooms[roomKey]);
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Socket ID ${socket.id} disconnected.`);

    // Remove the socket from all rooms it was part of
    for (const roomKey in rooms) {
      if (rooms[roomKey].includes(socket.id)) {
        rooms[roomKey] = rooms[roomKey].filter((id) => id !== socket.id);
        socket.to(roomKey).emit('userLeft', `Socket ID ${socket.id} disconnected.`);

        // If the room is empty, delete it
        if (rooms[roomKey].length === 0) {
          delete rooms[roomKey];
          console.log(`Room ${roomKey} is empty and has been deleted.`);
        } else {
          console.log(`Updated room ${roomKey}:`, rooms[roomKey]);
        }
      }
    }
  });
});

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
