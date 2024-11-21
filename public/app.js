const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const joinRoomButton = document.getElementById('joinRoom');
const endCallButton = document.getElementById('endCall');
const roomKeyInput = document.getElementById('roomKeyInput');
const sendMessageButton = document.getElementById('sendMessage');
const chatInput = document.getElementById('chatInput');
const messagesDiv = document.getElementById('messages');

const socket = io(); // Connect to the server

let localStream;
let peerConnection;
let roomKey;
let isRemoteDescriptionSet = false; // Track if the remote description is set
let iceCandidatesQueue = []; // Queue for storing ICE candidates before setting remote description

const servers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' } // STUN server
  ]
};

// Start local video stream
async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        console.log('Local stream started');
        if (peerConnection) {
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        } else {
            createPeerConnection(); // Create peer connection after local stream is initialized
        }
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Could not start video. Please check your camera and microphone permissions.');
    }
}

// Create a peer connection
function createPeerConnection() {
  console.log('Creating peer connection');
  peerConnection = new RTCPeerConnection(servers);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('Sending ICE candidate:', event.candidate);
      socket.emit('candidate', { candidate: event.candidate, roomKey });
    }
  };

  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
      console.log('Local stream tracks:', localStream.getTracks());
    });
  }

  peerConnection.ontrack = (event) => {
    console.log('Received remote stream:', event.streams[0]);
    remoteVideo.srcObject = event.streams[0];
  };
}

// Join a room
async function joinRoom() {
  roomKey = roomKeyInput.value.trim();
  if (!roomKey) {
    alert('Please enter a valid room key.');
    return;
  }

  console.log(`Joining room: ${roomKey}`);
  socket.emit('joinRoom', roomKey);

  try {
    await startLocalStream();
  } catch (error) {
    console.error('Failed to start local stream:', error);
    alert('Could not start video. Please check your camera and microphone permissions.');
    return;
  }

  endCallButton.disabled = false;

  // Notify the server that the user is ready
  socket.emit('ready', roomKey);
}

// End the call
function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
  console.log('Call ended');

  // Notify the server
  socket.emit('leaveRoom', roomKey);
  endCallButton.disabled = true;
}

// Send a chat message
function sendMessage() {
  const message = chatInput.value.trim();
  if (!message) return;

  socket.emit('chatMessage', { message, roomKey });
  displayMessage('You', message);
  chatInput.value = '';
}

// Display a chat message
function displayMessage(sender, message) {
  const messageElement = document.createElement('div');
  messageElement.textContent = `${sender}: ${message}`;
  messagesDiv.appendChild(messageElement);
  messagesDiv.scrollTop = messagesDiv.scrollHeight; // Auto-scroll to the bottom
}

// Socket events
socket.on('joinedRoom', (message) => {
  console.log(message);
});

socket.on('newUser', async (message) => {
  console.log(message);
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('offer', { type: 'offer', sdp: offer.sdp, roomKey });
});

socket.on('userLeft', (message) => {
  console.log(message);
});

socket.on('chatMessage', ({ message, sender }) => {
  displayMessage(sender, message);
});

// Setup signaling
socket.on('offer', async (data) => {
  console.log('Received offer:', data);

  if (!peerConnection) createPeerConnection();

  const offer = data.offer;

  // Validate the offer structure
  if (offer && offer.sdp && offer.type === 'offer') {
    try {
      console.log('Setting remote description for offer');
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      isRemoteDescriptionSet = true;

      // Create and set the local answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      console.log('Local description set with answer:', peerConnection.localDescription);

      // Send the answer back to the signaling server
      console.log('Sending answer');
      socket.emit('answer', { type: 'answer', sdp: answer.sdp, roomKey });

      // Process and add queued ICE candidates
      if (iceCandidatesQueue.length > 0) {
        console.log('Processing queued ICE candidates');
        for (const candidate of iceCandidatesQueue) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('Added queued ICE candidate:', candidate);
          } catch (error) {
            console.error('Error adding ICE candidate:', error);
          }
        }
        iceCandidatesQueue = []; // Clear the queue after processing
      } else {
        console.log('No ICE candidates in queue to process.');
      }
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  } else {
    console.error('Invalid offer received:', JSON.stringify(offer, null, 2));
  }
});

socket.on('answer', async (data) => {
  console.log('Received answer:', data);

  const answer = data.answer;

  // Validate the structure of the answer
  if (answer && answer.sdp && answer.type === 'answer') {
    try {
      console.log('Setting remote description for answer');
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      isRemoteDescriptionSet = true;

      // Process and add queued ICE candidates
      if (iceCandidatesQueue.length > 0) {
        console.log('Processing queued ICE candidates');
        for (const candidate of iceCandidatesQueue) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('Added queued ICE candidate:', candidate);
          } catch (error) {
            console.error('Error adding ICE candidate:', error);
          }
        }
        iceCandidatesQueue = []; // Clear the queue after processing
      } else {
        console.log('No ICE candidates in queue to process.');
      }
    } catch (error) {
      console.error('Error setting remote description for answer:', error);
    }
  } else {
    console.error('Invalid answer received:', JSON.stringify(answer, null, 2)); // Log detailed answer structure
  }
});

// ICE Candidate Handling (Check if remote description is set)
socket.on('candidate', ({ candidate }) => {
  if (isRemoteDescriptionSet) {
    console.log('Received ICE candidate');
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch((error) => {
      console.error('Error adding ICE candidate:', error);
    });
  } else {
    console.log('Remote description not set yet. Queueing ICE candidate.');
    iceCandidatesQueue.push(candidate);
  }
});

// Event listeners
joinRoomButton.addEventListener('click', joinRoom);
endCallButton.addEventListener('click', endCall);
sendMessageButton.addEventListener('click', sendMessage);
