/***
 * Excerpted from "Programming WebRTC",
 * published by The Pragmatic Bookshelf.
 * Copyrights apply to this code. It may not be used to create training material,
 * courses, books, articles, and the like. Contact us if you are in doubt.
 * We make no guarantees that this code is fit for any purpose.
 * Visit https://pragprog.com/titles/ksrtc for more book information.
***/
'use strict';

/**
 *  Global Variables: $self and $peers
 */

const $self = {
  rtcConfig: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  },
  mediaConstraints: { audio: true, video: true },
  mediaDevices: { audioinput: [], videoinput: [] },
  mediaStream: new MediaStream(),
  mediaTracks: {},
  features: {
    audio: false,
    video: true,
  },
};

const $peers = new Map();



/**
 *  Signaling-Channel Setup
 */

const namespace = prepareNamespace(window.location.hash, true);

const sc = io.connect('/' + namespace, { autoConnect: false });

registerScCallbacks();



/**
 * =========================================================================
 *  Begin Application-Specific Code
 * =========================================================================
 */



/**
 *  User-Interface Setup
 */

document.querySelector('#toggle-mic')
  .setAttribute('aria-checked', $self.features.audio);

document.querySelector('#header h1')
  .innerText = 'Welcome to Room #' + namespace;

document.querySelector('#call-button')
  .addEventListener('click', handleCallButton);

document.querySelector('#footer')
  .addEventListener('click', handleMediaButtons);

document.querySelector('#username-form')
  .addEventListener('submit', handleUsernameForm);



/**
 *  User-Media Setup and Events
 */

requestUserMedia($self.mediaConstraints);

// These events can fire in rapid succession when,
// for example, a camera with built-in mic is connected.
// That's why it's necessary to debounce to 500ms before
// executing the callback. Otherwise, the callback might
// prompt users to access the camera, and then again to
// access the camera and the mic both.
navigator.mediaDevices.ondevicechange = debounce(handleMediaDeviceChange, 500);



/**
 *  User-Interface Functions and Callbacks
 */

function handleCallButton(event) {
  const call_button = event.target;
  if (call_button.className === 'join') {
    console.log('Joining the call...');
    call_button.className = 'leave';
    call_button.innerText = 'Leave Call';
    joinCall();
  } else {
    console.log('Leaving the call...');
    call_button.className = 'join';
    call_button.innerText = 'Join Call';
    leaveCall();
  }
}

function joinCall() {
  sc.open();
}

function leaveCall() {
  sc.close();
  for (let id of $peers.keys()) {
    resetPeer(id);
  }
}

function handleMediaButtons(event) {
  const target = event.target;
  if (target.tagName !== 'BUTTON') return;
  switch (target.id) {
  case 'toggle-mic':
    toggleMic(target);
    break;
  case 'toggle-cam':
    toggleCam(target);
    break;
  }
}

function toggleMic(button) {
  const audio = $self.mediaTracks.audio;
  const enabled_state = audio.enabled = !audio.enabled;

  $self.features.audio = enabled_state;

  button.setAttribute('aria-checked', enabled_state);

  for (let id of $peers.keys()) {
    shareFeatures(id, 'audio');
  }
}

function toggleCam(button) {
  const video = $self.mediaTracks.video;
  const enabled_state = video.enabled = !video.enabled;

  $self.features.video = enabled_state;

  button.setAttribute('aria-checked', enabled_state);

  for (let id of $peers.keys()) {
    shareFeatures(id, 'video');
  }

  if (enabled_state) {
    $self.mediaStream.addTrack($self.mediaTracks.video);
  } else {
    $self.mediaStream.removeTrack($self.mediaTracks.video);
    displayStream($self.mediaStream);
  }
}

function enableOrDisableMediaToggleButtons() {
  const audio_button = document.querySelector('#toggle-mic');
  const video_button = document.querySelector('#toggle-cam');

  // Set the disabled attribute's value based on the
  // available media devices
  audio_button.disabled = $self.mediaDevices.audioinput.length === 0;
  video_button.disabled = $self.mediaDevices.videoinput.length === 0;
}

function handleUsernameForm(e) {
  e.preventDefault();
  const form = e.target;
  const username = form.querySelector('#username-input').value;
  const figcaption = document.querySelector('#self figcaption');
  figcaption.innerText = username;

  $self.features.username = username;

  for (let id of $peers.keys()) {
    shareFeatures(id, 'username');
  }
}



/**
 *  User-Media and Data-Channel Functions
 */

async function detectAvailableMediaDevices() {
  // Assume there are no devices until we detect them
  $self.mediaDevices.audioinput = [];
  $self.mediaDevices.videoinput = [];

  const devices = await navigator.mediaDevices.enumerateDevices();

  for (let device of devices) {
    // Only interested in audio and video inputs
    const input_kinds = ['audioinput', 'videoinput'];
    if (input_kinds.includes(device.kind)) {
      $self.mediaDevices[device.kind].push(device);
    }
  }
}

async function handleMediaDeviceChange() {
  const previous_devices =
    $self.mediaDevices.audioinput.length > 0
      || $self.mediaDevices.videoinput.length > 0;

  // First things first: on any device change,
  // update the list of available media devices
  await detectAvailableMediaDevices();

  const available_devices =
    $self.mediaDevices.audioinput.length > 0
      || $self.mediaDevices.videoinput.length > 0;

  // Case One: A device has been plugged in and
  // no other devices were previously available
  if (!previous_devices && available_devices) {
    // Request user media as though the app had just been opened,
    // but await it so that we can ensure there's media available
    // before adding it to the connection
    await requestUserMedia($self.mediaConstraints);

    for (let id of $peers.keys()) {
      addStreamingMedia(id);
      shareFeatures(id, 'audio', 'video');
    }
  }

  // Case Two: The current device has been unplugged
  // and there are now no devices available
  if (!available_devices) {
    // Reset all the media properties
    $self.media = false;
    $self.mediaTracks = {};
    $self.mediaStream = new MediaStream();
    // Toggle off the media buttons, and null out
    // the self-side stream
    enableOrDisableMediaToggleButtons();
    displayStream(null);
    // Remove tracks from peer connections
    for (let id of $peers.keys()) {
      removeStreamingMedia(id);
    }
  }
}

async function requestUserMedia(media_constraints) {
  // Duplicate the media constraints so as to not affect
  // the original values on $self
  const refined_media_constraints =
    JSON.parse(JSON.stringify(media_constraints));

  // See what devices are available
  await detectAvailableMediaDevices();

  // Refine media constraints based on device availability
  if ($self.mediaDevices.audioinput.length === 0) {
    // There's no audio device, so ensure that constraint is false
    refined_media_constraints.audio = false;
  }
  if ($self.mediaDevices.videoinput.length === 0) {
    // There's no video device, so ensure that constraint is false
    refined_media_constraints.video = false;
  }

  // Disable or re-enable toggle buttons
  enableOrDisableMediaToggleButtons();

  if (!refined_media_constraints.audio &&
        !refined_media_constraints.video) {
    // If no media is available, we exit, as passing
    // { audio: false, video: false } as a constraint
    // results in a TypeError
    return;
  }

  try {
    $self.media = await navigator.mediaDevices
      .getUserMedia(refined_media_constraints);
    // Detect the devices again, now that permissions
    // have been granted; this helps capture a value
    // on the "label" field on MediaDeviceInfo for
    // easier inspection
    await detectAvailableMediaDevices();
  } catch(e) {
    console.error(e.name, e.message);
  }

  // Hold onto audio- and video-track references
  $self.mediaTracks.audio = $self.media.getAudioTracks()[0];
  $self.mediaTracks.video = $self.media.getVideoTracks()[0];

  if ($self.mediaTracks.audio) {
    // Mute the audio if `$self.features.audio` evaluates to `false`
    $self.mediaTracks.audio.enabled = !!$self.features.audio;
    // Add audio track to mediaStream
    $self.mediaStream.addTrack($self.mediaTracks.audio);
  }
  if ($self.mediaTracks.video) {
    // Toggle off the camera if `$self.features.video` evaluates to `false`
    $self.mediaTracks.video.enabled = !!$self.features.video;
    // Add video track to mediaStream
    $self.mediaStream.addTrack($self.mediaTracks.video);
  }

  displayStream($self.mediaStream);
}

function createVideoStructure(id) {
  const figure = document.createElement('figure');
  const figcaption = document.createElement('figcaption');
  const video = document.createElement('video');
  const attributes = {
    autoplay: '',
    playsinline: '',
    poster: 'img/placeholder.png',
  };
  const attributes_list = Object.keys(attributes);

  // Set attributes
  figure.id = `peer-${id}`;
  figcaption.innerText = id;
  for (let attr of attributes_list) {
    video.setAttribute(attr, attributes[attr]);
  }
  // Append the video and figcaption elements
  figure.appendChild(video);
  figure.appendChild(figcaption);
  // Return the complete figure
  return figure;
}

function displayStream(stream, id = 'self') {
  const selector = id === 'self' ? '#self' : `#peer-${id}`;
  let video_structure = document.querySelector(selector);
  if (!video_structure) {
    const videos = document.querySelector('#videos');
    video_structure = createVideoStructure(id);
    videos.appendChild(video_structure);
  }
  video_structure.querySelector('video').srcObject = stream;
}

function addStreamingMedia(id) {
  const peer = $peers.get(id);
  const tracks = Object.keys($self.mediaTracks);
  for (let track of tracks) {
    if ($self.mediaTracks[track]) {
      peer.connection.addTrack($self.mediaTracks[track]);
    }
  }
}

function removeStreamingMedia(id) {
  const peer = $peers.get(id);
  // Detect the senders on the connection; we need
  // them to remove tracks from the peer connection
  const senders = peer.connection.getSenders();
  const senders_list = Object.keys(senders);
  // Loop through the senders, and pull the tracks
  // off them, one by one
  for (let sender of senders_list) {
    const track = senders[sender].track;
    if (track) {
      // Remove the track on its associated sender
      peer.connection.removeTrack(senders[sender]);
    }
  }
  // Send a 'removeAllTracks' feature to clean things up
  // on the receiving peer's side.
  shareFeatures(id, 'removeAllTracks');
}

function addFeaturesChannel(id) {
  const peer = $peers.get(id);

  const featureFunctions = {
    audio: function() {
      const username = peer.features.username ? peer.features.username : id;
      showUsernameAndMuteStatus(username);
    },
    removeAllTracks: function() {
      const tracks_list = Object.keys(peer.mediaTracks);
      for (let track of tracks_list) {
        peer.mediaStream.removeTrack(peer.mediaTracks[track]);
      }
      // Empty out the media tracks object
      peer.mediaTracks = {};
      // Create a brand-new media stream in case tracks
      // need to be added later
      peer.mediaStream = new MediaStream();
      // But null out the display of the media stream
      // for the time being
      displayStream(null, id);
    },

    username: function() {
      // Update the username
      showUsernameAndMuteStatus(peer.features.username);
    },
    video: function() {
      // This is all just to display the poster image,
      // rather than a black frame
      if (peer.mediaTracks.video) {
        if (peer.features.video) {
          peer.mediaStream.addTrack(peer.mediaTracks.video);
        } else {
          peer.mediaStream.removeTrack(peer.mediaTracks.video);
          displayStream(peer.mediaStream, id);
        }
      }
    },
  };

  peer.featuresChannel =
    peer.connection.createDataChannel('features',
      { negotiated: true, id: 110 });

  peer.featuresChannel.onopen = function() {
    // send features information just as soon as the channel opens
    peer.featuresChannel.send(JSON.stringify($self.features));
  };

  peer.featuresChannel.onmessage = function(event) {
    const features = JSON.parse(event.data);
    const features_list = Object.keys(features);
    for (let f of features_list) {
      // update the corresponding features field on $peer
      peer.features[f] = features[f];
      // if there's a corresponding function, run it
      if (typeof featureFunctions[f] === 'function') {
        featureFunctions[f]();
      }
    }
  };

  function showUsernameAndMuteStatus(username) {
    const fc = document.querySelector(`#peer-${id} figcaption`);
    if (peer.features.audio) {
      fc.innerText = username;
    } else {
      fc.innerText = `${username} (Muted)`;
    }
  }
}

function shareFeatures(id, ...features) {
  const peer = $peers.get(id);

  const featuresToShare = {};

  if (!peer.featuresChannel) return;

  for (let f of features) {
    featuresToShare[f] =
      $self.features[f] ? $self.features[f] : 'true';
  }

  try {
    peer.featuresChannel.send(JSON.stringify(featuresToShare));
  } catch(e) {
    console.error('Error sending features:', e);
  }
}



/**
 *  Call Features & Reset Functions
 */

function initializePeer(id, polite) {
  $peers.set(id, {
    connection: new RTCPeerConnection($self.rtcConfig),
    mediaStream: new MediaStream(),
    mediaTracks: {},
    features: {},
    selfStates: {
      isPolite: polite,
      isMakingOffer: false,
      isIgnoringOffer: false,
      isSettingRemoteAnswerPending: false,
      isSuppressingInitialOffer: false,
    },
  });
}

function establishCallFeatures(id) {
  registerRtcCallbacks(id);
  addFeaturesChannel(id);
  // Always set up a display stream, even
  // for users who might not have streaming
  // media. Set the stream itself to null
  displayStream(null, id);
  addStreamingMedia(id);
}

function resetPeer(id) {
  const peer = $peers.get(id);
  displayStream(null, id);
  document.querySelector(`#peer-${id}`).remove();
  peer.connection.close();
  $peers.delete(id);
}



/**
 *  WebRTC Functions and Callbacks
 */

function registerRtcCallbacks(id) {
  const peer = $peers.get(id);
  peer.connection
    .onconnectionstatechange = handleRtcConnectionStateChange(id);
  peer.connection
    .onnegotiationneeded = handleRtcConnectionNegotiation(id);
  peer.connection
    .onicecandidate = handleRtcIceCandidate(id);
  peer.connection
    .ontrack = handleRtcPeerTrack(id);
}

function handleRtcPeerTrack(id) {
  return function({ track }) {
    const peer = $peers.get(id);
    console.log(`Handle incoming ${track.kind} track from peer ID: ${id}`);
    peer.mediaTracks[track.kind] = track;
    peer.mediaStream.addTrack(track);
    displayStream(peer.mediaStream, id);
  };
}



/**
 * =========================================================================
 *  End Application-Specific Code
 * =========================================================================
 */


/**
 *  Reusable WebRTC Functions and Callbacks
 */
function handleRtcConnectionNegotiation(id) {
  return async function() {
    const peer = $peers.get(id);
    const self_state = peer.selfStates;
    // peers suppressing initial offers should do nothing but exit
    if (self_state.isSuppressingInitialOffer) return;
    // older browsers do not automatically create an offer when they
    // call `setLocalDescription`
    try {
      self_state.isMakingOffer = true;
      await peer.connection.setLocalDescription();
    } catch(e) {
      // manually create the offer with the automatic version fails
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
    } finally {
      // however the local description is set, send it over the
      // signaling channel
      sc.emit('signal',
        { recipient: id, sender: $self.id,
          signal: { description: peer.connection.localDescription } });
      self_state.isMakingOffer = false;
    }
  };
}

function handleRtcIceCandidate(id) {
  return function({ candidate }) {
    if (candidate) {
      console.log(`Handling ICE candidate, type '${ candidate.type }'...`);
    }
    sc.emit('signal', { recipient: id, sender: $self.id,
      signal: { candidate } });
  };
}

function handleRtcConnectionStateChange(id) {
  return function() {
    const peer = $peers.get(id);
    const connection_state = peer.connection.connectionState;
    // Assume *some* element will take a unique peer ID
    const peer_element = document.querySelector(`#peer-${id}`);
    if (peer_element) {
      peer_element.dataset.connectionState = connection_state;
    }
    console.log(`Connection state '${connection_state}' for Peer ID: ${id}`);
  };
}



/**
 *  Signaling-Channel Functions and Callbacks
 */

function registerScCallbacks() {
  sc.on('connect', handleScConnect);
  sc.on('connected peers', handleScConnectedPeers);
  sc.on('connected peer', handleScConnectedPeer);
  sc.on('disconnected peer', handleScDisconnectedPeer);
  sc.on('signal', handleScSignal);
}

function handleScConnect() {
  console.log('Successfully connected to the signaling server!');
  $self.id = sc.id;
  console.log(`Self ID: ${$self.id}`);
}

function handleScConnectedPeers({ peers, credentials }) {
  const ids = peers;
  console.log(`Connected peer IDs: ${ids.join(', ')}`);

  console.log(`TURN Credentials: ${JSON.stringify(credentials)}`);
  // addCredentialedTurnServer('turn:coturn.example.com:3478', credentials);

  for (let id of ids) {
    if (id === $self.id) continue;
    // be polite with already-connected peers
    initializePeer(id, true);
    establishCallFeatures(id);
  }
}

function handleScConnectedPeer(id) {
  console.log(`Newly connected peer ID: ${id}`);
  // be impolite with each newly connecting peer
  initializePeer(id, false);
  establishCallFeatures(id);
}

function handleScDisconnectedPeer(id) {
  console.log(`Disconnected peer ID: ${id}`);
  resetPeer(id);
}

function resetAndRetryConnection(id) {
  const peer = $peers.get(id);
  // Preserve the original politeness value
  const is_polite = peer.selfStates.isPolite;
  // Re-initialize the peer
  initializePeer(id, is_polite);
  const self_state = peer.selfStates;
  // Set the offer-suppression state property to `true` for the
  // polite peer
  self_state.isSuppressingInitialOffer = is_polite;

  // Reestablish the call features, which triggers
  // the `negotiationneeded` event and its callback again
  establishCallFeatures(id);

  // Inform the impolite peer to reset, too:
  if (is_polite) {
    sc.emit('signal', { description: { type: '_reset' } });
  }
}

async function handleScSignal({ sender,
  signal: { candidate, description } }) {

  const id = sender;
  const peer = $peers.get(id);
  const self_state = peer.selfStates;

  if (description) {

    if (description.type === '_reset') {
      // Reset and retry the connection, and exit the `handleScSignal()`
      // function
      resetAndRetryConnection(id);
      return;
    }

    const ready_for_offer =
          !self_state.isMakingOffer &&
          (peer.connection.signalingState === 'stable'
            || self_state.isSettingRemoteAnswerPending);

    const offer_collision =
          description.type === 'offer' && !ready_for_offer;

    self_state.isIgnoringOffer = !self_state.isPolite && offer_collision;

    if (self_state.isIgnoringOffer) {
      return;
    }

    self_state.isSettingRemoteAnswerPending = description.type === 'answer';

    await peer.connection.setRemoteDescription(description);

    self_state.isSettingRemoteAnswerPending = false;

    if (description.type === 'offer') {
      await peer.connection.setLocalDescription();
      sc.emit('signal', { recipient: id, sender: $self.id,
        signal: { description: peer.connection.localDescription } });
    }

  } else if (candidate) {
    // Handle ICE candidates
    try {
      await peer.connection.addIceCandidate(candidate);
    } catch(e) {
      // Log error unless state is ignoring offers
      // and candidate is not an empty string
      if (!self_state.isIgnoringOffer && candidate.candidate.length > 1) {
        console.error(`Unable to add ICE candidate for peer ID: ${id}.`, e);
      }
    }
  }
}



/**
 *  Utility Functions
 */

function addCredentialedTurnServer(server_string, { username, password }) {
  // Add TURN server and credentials to iceServers array
  $self.rtcConfig.iceServers.push({
    urls: server_string,
    username: username,
    password: password,
  });
}

function prepareNamespace(hash, set_location) {
  let ns = hash.replace(/^#/, ''); // remove # from the hash
  if (/^[a-z]{4}-[a-z]{4}-[a-z]{4}$/.test(ns)) {
    console.log(`Checked existing namespace '${ns}'`);
    return ns;
  }
  ns = generateRandomAlphaString('-', 4, 4, 4);
  console.log(`Created new namespace '${ns}'`);
  if (set_location) window.location.hash = ns;
  return ns;
}

function generateRandomAlphaString(separator, ...groups) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let ns = [];
  for (let group of groups) {
    let str = '';
    for (let i = 0; i < group; i++) {
      str += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    ns.push(str);
  }
  return ns.join(separator);
}

function debounce(callback_function, wait_in_milliseconds) {
  let timeout;
  return (...args) => {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(
      () => callback_function.apply(context, args),
      wait_in_milliseconds);
  };
}
