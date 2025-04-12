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
 *  Global Variables: $self and $peer
 */
const $self = {
  mediaConstraints: { audio: false, video: true }
  // mediaConstraints: { audio: true, video: false }
};

/**
 *  Signaling-Channel Setup
 */
const namespace = prepareNamespace(window.location.hash, true);
const sc = io.connect('/' + namespace, { autoConnect: false});

registerScCallbacks()

/**
 * =========================================================================
 *  Begin Application-Specific Code
 * =========================================================================
 */



/**
 *  User-Interface Setup
 */
document.querySelector('#header h1').innerText = "Welcom to Room #" + namespace;
document.querySelector('#call-button').addEventListener('click', handleCallButton);

/**
 *  User-Media Setup
 */
requestUserMedia($self.mediaConstraints);

/**
 *  User-Interface Functions and Callbacks
 */
function handleCallButton(event) {
  const call_button = event.target
  if (call_button.className === 'join') {
    call_button.className = 'leave';
    call_button.innerText = 'Leave Call';
    joinCall();
  } else {
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
}

/**
 *  User-Media Functions
 */
async function requestUserMedia(media_constraints) {
  $self.mediaStream = new MediaStream();
  $self.media = await navigator.mediaDevices.getUserMedia(media_constraints);

  $self.mediaStream.addTrack($self.media.getTracks()[0]);
  displayStream($self.mediaStream, '#self')
}

function displayStream(stream, selector) {
  document.querySelector(selector).srcObject = stream;
}

/**
 *  Call Features & Reset Functions
 */



/**
 *  WebRTC Functions and Callbacks
 */



/**
 * =========================================================================
 *  End Application-Specific Code
 * =========================================================================
 */



/**
 *  Reusable WebRTC Functions and Callbacks
 */



/**
 *  Signaling-Channel Functions and Callbacks
 */
function registerScCallbacks() {
  sc.on('connect', handelScConnect);
  sc.on('connected peer', handelScConnectedPeer);
  sc.on('disconnected peer', handelScDisconnectedPeer);
  sc.on('signal', handelScSignal);
}

function handelScConnect() {
  console.log('connected')
}
function handelScConnectedPeer() {}
function handelScDisconnectedPeer() {}
function handelScSignal() {}

/**
 *  Utility Functions
 */
function prepareNamespace(hash, set_location) {
  let ns = hash.replace(/^#/, '')
  if (/^[0-9]{7}$/.test(ns)) {
    return ns
  }
  ns = Math.random().toString().substring(2, 9);
  if (set_location) window.location.hash = ns;
  return ns
}
