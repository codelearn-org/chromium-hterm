// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview Google Text-to-speech component extension for Chrome OS.
 *
 * The metadata about the voices to load is contained in two places:
 *
 * 1. The manifest file defines the voices that are actually exposed to
 *    the end-user, including the exposed name of each voice. It also
 *    specifies which voice data scripts to load.
 *
 * 2. Each voice has an associated data script, named voice_data_*.js.
 *    When run, each file adds one or more entries to the global
 *    variable window.voices.
 *
 * The advantage of this design is that temporarily disabling a new
 * voice can be done just by modifying manifest.json, it doesn't require
 * editing any other source files.
 */

'use strict';

var TtsController = function() {
  this.callbackMap = {};
  this.utteranceId = 0;
  this.nativeTts = null;
  this.initialized = false;
  this.startTime = undefined;
  this.timeouts = [];
  this.voice = null;
  this.lang = '';
  this.voiceName = '';
  this.pendingSpeechRequest = null;
};

TtsController.prototype.run = function() {
  document.addEventListener('unload', this.unload, false);
  this.getVoiceNamesFromManifest(function() {
    this.loadLastUsedVoice();
    this.createNativeTts();
    chrome.ttsEngine.onSpeak.addListener(this.onSpeak.bind(this));
    chrome.ttsEngine.onStop.addListener(this.onStop.bind(this));
  });
};

TtsController.prototype.getVoiceNamesFromManifest = function(completion) {
  var self = this;
  var xhr = new XMLHttpRequest();
  xhr.onload = function() {
    var manifest = JSON.parse(this.responseText);
    var manifestVoices = manifest.tts_engine.voices;
    var langGenderMap = {};
    for (var i = 0; i < manifestVoices.length; i++) {
      langGenderMap[manifestVoices[i].lang + '-' + manifestVoices[i].gender] =
          manifestVoices[i].voice_name;
    }
    for (var i = 0; i < window.voices.length; i++) {
      window.voices[i].voiceName =
          langGenderMap[window.voices[i].lang + '-' + window.voices[i].gender];
    }
    (completion.bind(self))();
  };
  xhr.open('get', chrome.extension.getURL('manifest.json'), true);
  xhr.send();
};

TtsController.prototype.loadLastUsedVoice = function() {
  var lang = localStorage['lastUsedLang'] || navigator.language;
  var gender = localStorage['lastUsedGender'] || '';
  var voiceName = localStorage['lastUsedVoiceName'];
  if (voiceName) {
    for (var i = 0; i < window.voices.length; i++) {
      if (window.voices[i].voiceName == voiceName) {
        this.voice = window.voices[i];
      }
    }
  }
  if (!this.voice) {
    this.voice = this.findBestMatchingVoiceMultiplePasses(lang, gender);
  }
  this.lang = this.voice.lang;
  this.gender = this.voice.gender;
  this.voiceName = this.voice.voiceName;
};

TtsController.prototype.findBestMatchingVoiceMultiplePasses = function(lang, gender) {
  // Exact match (speak 'xx-YY' matches lang 'xx-YY')
  var voice = this.findBestMatchingVoice(lang, gender, false);
  if (voice) {
    return voice;
  }

  // Prefix match (speak 'xx' matches lang 'xx-YY')
  voice = this.findBestMatchingVoice(lang, gender, true);
  if (voice) {
    return voice;
  }

  // Match first two letters only (speak 'xx-ZZ' matches lang 'xx-YY')
  voice = this.findBestMatchingVoice(lang.substr(0, 2), gender, true);
  if (voice) {
    return voice;
  }

  // Match first two letters only, and ignore the gender.
  voice = this.findBestMatchingVoice(lang.substr(0, 2), '', true);
  if (voice) {
    return voice;
  }

  // If all else fails, return the first voice.
  return this.findBestMatchingVoice('', '', true);
};

TtsController.prototype.findBestMatchingVoice = function(
    lang, gender, prefixOnly) {
  for (var i = 0; i < window.voices.length; i++) {
    var voice = window.voices[i];
    if (gender != '' && voice.gender != '' && gender != voice.gender) {
      continue;
    }
    if (voice.lang == lang) {
      return voice;
    }
    if (prefixOnly && voice.lang.substr(0, lang.length) == lang) {
      return voice;
    }
  }
  return null;
};

TtsController.prototype.switchVoiceIfNeeded = function(
    voiceName, lang, gender) {
  var voice = null;
  if (voiceName) {
    for (var i = 0; i < window.voices.length; i++) {
      if (window.voices[i].voiceName == voiceName) {
        voice = window.voices[i];
      }
    }
  }
  if (!lang) {
    lang = '';
  }
  if (!gender) {
    gender = '';
  }

  if (!voice && (lang || gender)) {
    // First check if the current voice is a valid match - if so, stick with
    // the current voice. The purpose of this code is so that, for example,
    // if one utterance wants 'en-GB' and a British voice is loaded, and
    // the next utterance just wants 'en', it doesn't switch to an American
    // voice, but rather stays with the loaded British voice.
    if (!gender || !this.gender || gender == this.gender) {
      if (!lang || lang == this.lang) {
        // It's an exact match.
        voice = this.voice;
      } else {
        if (this.lang.substr(0, lang.length) == lang &&
            this.findBestMatchingVoice(lang, gender, false) == null) {
          // It's a partial language match AND there's no better match.
          voice = this.voice;
        }
      }
    }

    // Otherwise, look for the best matching voice.
    if (!voice) {
      voice = this.findBestMatchingVoiceMultiplePasses(lang, gender);
    }
  }

  if (voice && voice.voiceName != this.voiceName) {
    console.log('Switching to voice: ' + voice.voiceName);
    localStorage['lastUsedLang'] = voice.lang;
    localStorage['lastUsedGender'] = voice.gender;
    localStorage['lastUsedVoiceName'] = voice.voiceName;
    this.nativeTts.removeEventListener(
        'message', this.handleMessageCallback, false);
    this.unload();
    this.nativeTts.parentElement.removeChild(this.nativeTts);
    this.nativeTts = null;
    this.initialized = false;
    this.voice = voice;
    this.lang = voice.lang;
    this.gender = voice.gender;
    this.voiceName = voice.voiceName;
    this.createNativeTts();
    return true;
  }

  return false;
};

TtsController.prototype.createNativeTts = function() {
  var embed = document.createElement('embed');
  embed.setAttribute('id', 'tts');
  embed.setAttribute('name', 'nacl_module');
  embed.setAttribute('src', 'tts_service.nmf');
  embed.setAttribute('type', 'application/x-nacl');
  embed.addEventListener('load', this.load.bind(this), false);
  document.body.appendChild(embed);
  this.nativeTts = embed;
};

TtsController.prototype.clearTimeouts = function() {
  for (var i = 0; i < this.timeouts.length; i++) {
    window.clearTimeout(this.timeouts[i]);
  }
  this.timeouts.length = 0;
};

TtsController.prototype.escapePluginArg = function(str) {
  return str.replace(/:/g, '\\:');
};

TtsController.prototype.onStop = function() {
  this.pendingSpeechRequest = null;
  delete this.callbackMap[this.utteranceId];
  this.clearTimeouts();
  this.nativeTts.postMessage('stop');
};

TtsController.prototype.onSpeak = function(utterance, options, callback) {
  console.log('Will speak: "' + utterance + '" lang="' + options.lang + '"');

  if (this.nativeTts && !this.initialized) {
    if (!this.pendingSpeechRequest) {
      this.pendingSpeechRequest = [utterance, options, callback];
    }
    return;
  }

  if (this.switchVoiceIfNeeded(
      options.voiceName, options.lang, options.gender)) {
    this.pendingSpeechRequest = [utterance, options, callback];
    return;
  }

  this.onStop();

  this.utteranceId++;
  var escapedUtterance = this.escapePluginArg(utterance);

  // The Phonetic Arts engine splits things into sentences and doesn't
  // always speak something if you give it always a single word or
  // character. As a hack, add a period to the end so that there's always
  // a sentence.  TODO(dmazzoni) remove this when bug is fixed.
  escapedUtterance += ' .';

  var rate = options.rate || 1.0;
  var pitch = options.pitch || 1.0;
  var volume = options.volume || 1.0;

  var lowercase = escapedUtterance.toLowerCase();

  var tokens = ['speak', rate, pitch, volume,
                this.utteranceId, escapedUtterance, lowercase];
  this.nativeTts.postMessage(tokens.join(':'));
  console.log('Plug-in args are ' + tokens.join(':'));
  this.callbackMap[this.utteranceId] = (function(type, charIndex) {
    console.log('Doing callback ' + type + ' for ' + this.utteranceId);
    var response = {type: type};
    response.charIndex = charIndex ?
                         charIndex :
                         (type == 'end' ? utterance.length : 0);
    callback(response);
    if (type == 'end' || type == 'interrupted' ||
        type == 'cancelled' || type == 'error') {
      delete this.callbackMap[this.utteranceId];
      this.clearTimeouts();
    }
  }).bind(this);
};

TtsController.prototype.progress = function(percent) {
  if (percent % 10 == 0) {
    console.log(percent + '% complete.');
  };
};

TtsController.prototype.handleTtsEvent = function(id, deltaTime, charIndex) {
  var callback = this.callbackMap[id];
  if (deltaTime == 0.0 && charIndex == 0) {
    this.startTime = new Date();
    if (callback) {
      callback('start');
    }
    return;
  };

  var currentTime = (new Date() - this.startTime);
  if (currentTime > 1000 * deltaTime) {
    callback('word', charIndex);
  } else {
    var timeoutId = window.setTimeout(function() {
      callback('word', charIndex);
    }, 1000 * deltaTime - currentTime);
    this.timeouts.push(timeoutId);
  }
}

TtsController.prototype.handleMessage = function(message_event) {
  var data = message_event.data;

  // Log everything except 'percent' messages (those are too verbose).
  if (data.substr(0, 8) != 'percent:') {
    console.log('Got message: ' + data);
  }

  if (data.substr(0, 4) == 'end:') {
    var id = data.substr(4);
    console.log('Got end event for utterance: ' + id);
    var callback = this.callbackMap[id];
    if (callback) {
      console.log('Calling callback');
      callback('end');
    }
  } else if (data == 'error') {
    console.log('error');
  } else if (data == 'idle' && !this.initialized) {
    this.initialized = true;
    this.speakPendingRequest();
  } else if (data.substr(0, 8) == 'percent:') {
    this.progress(parseInt(data.substr(8), 10));
  } else if (data.substr(0, 6) == 'event:') {
    var tokens = data.split(':');
    this.handleTtsEvent(parseInt(tokens[1], 10),
                        parseFloat(tokens[2]),
                        parseInt(tokens[3], 10));
  }
};

TtsController.prototype.speakPendingRequest = function() {
  if (!this.pendingSpeechRequest)
    return;

  var utterance = this.pendingSpeechRequest[0];
  var options = this.pendingSpeechRequest[1];
  var callback = this.pendingSpeechRequest[2];
  this.pendingSpeechRequest = null;
  this.onSpeak(utterance, options, callback);
};

TtsController.prototype.load = function() {
  this.handleMessageCallback = this.handleMessage.bind(this);
  console.log('Adding event listener for ' + this.nativeTts.id);
  this.nativeTts.addEventListener(
      'message', this.handleMessageCallback, false);

  // The lower the chunk size, the lower the latency of the audio - but
  // Chrome's audio implementation can't always handle the smallest possible
  // sizes on all operating systems. This value is the smallest that works
  // well on Chrome OS.
  var chunkSize = 256;

  var args = [this.escapePluginArg(this.voice.projectFile),
              this.escapePluginArg(this.voice.prefix)];
  this.nativeTts.postMessage('setProjectFileAndPrefix:' + args.join(':'));

  for (var i = 0; i < this.voice.removePaths.length; i++) {
    var path = this.voice.removePaths[i];
    this.nativeTts.postMessage('removeDataFile:' + escapePluginArg(path));
  }

  for (var i = 0; i < this.voice.files.length; i++) {
    var dataFile = this.voice.files[i];
    var url = dataFile.url;
    if (!url) {
      url = chrome.extension.getURL(dataFile.path);
    }
    args = [this.escapePluginArg(url),
            this.escapePluginArg(dataFile.path),
            this.escapePluginArg(dataFile.md5sum),
            this.escapePluginArg(String(dataFile.size))];
    if (this.voice.cacheToDisk) {
      this.nativeTts.postMessage('addDataFile:' + args.join(':'));
    } else {
      this.nativeTts.postMessage('addMemoryFile:' + args.join(':'));
    }
  }

  this.nativeTts.postMessage('startService:' + chunkSize);
};

TtsController.prototype.unload = function() {
  this.nativeTts.postMessage('stopService');
};

var ttsController = new TtsController();
ttsController.run();
