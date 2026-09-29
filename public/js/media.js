const Media = (() => {
  const VIDEO_CONSTRAINTS = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 24, max: 30 },
    facingMode: 'user',
  };

  const AUDIO_CONSTRAINTS = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  function isSupported() {
    return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection);
  }

  function describeError(err) {
    switch (err && err.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'permission-denied';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'not-found';
      case 'NotReadableError':
      case 'AbortError':
        return 'in-use';
      default:
        return 'unknown';
    }
  }

  // Tries to get what was asked for, then degrades gracefully:
  // audio+video -> audio only -> nothing (listen-only).
  async function getLocalStream({ video = true } = {}) {
    const result = { stream: new MediaStream(), audio: false, video: false, videoError: null, audioError: null };

    if (video) {
      try {
        result.stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: VIDEO_CONSTRAINTS });
        result.audio = true;
        result.video = true;
        return result;
      } catch (err) {
        result.videoError = describeError(err);
      }
    }

    try {
      result.stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      result.audio = true;
    } catch (err) {
      result.audioError = describeError(err);
    }

    // Audio may have worked on its own even though the combined request failed,
    // but it can also be that only the camera is available.
    if (video && !result.audio && result.videoError !== 'permission-denied') {
      try {
        result.stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS });
        result.video = true;
        result.videoError = null;
      } catch (err) {
        result.videoError = describeError(err);
      }
    }

    return result;
  }

  async function getCameraTrack() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS });
    return stream.getVideoTracks()[0];
  }

  async function getMicrophoneTrack() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
    return stream.getAudioTracks()[0];
  }

  function stopStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
  }

  return { isSupported, describeError, getLocalStream, getCameraTrack, getMicrophoneTrack, stopStream };
})();
