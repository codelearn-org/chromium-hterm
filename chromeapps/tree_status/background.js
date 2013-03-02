// Copyright (c) 2013 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

var animationFrames = 36;
var animationSpeed = 10; // ms
var canvas;
var canvasContext;
var treeOpenImage;
var treeClosedImage;
var treeNeitherImage;
var pollIntervalMin = 1000 * 60;  // 1 minute
var pollIntervalMax = 1000 * 60 * 60;  // 1 hour
var requestFailureCount = 0;  // used for exponential backoff
var requestTimeout = 1000 * 2;  // 5 seconds
var rotation = 0;
var treeStatus = -1;
var loadingAnimation = new LoadingAnimation();
var statusTimeoutId = null;

function getChromeBuildUrl() {
  var url = "http://chromiumos-status.appspot.com/current";
  if (localStorage.customStatus)
    url = localStorage.customStatus;
  return url + "?format=json";
}

function waterfallUrl() {
  url = "http://build.chromium.org/p/chromiumos/waterfall";
  if (localStorage.customWaterfall)
    url = localStorage.customWaterfall;
  return url;
}

// A "loading" animation displayed while we wait for the first response.
// This animates the badge text with a dot that cycles from left to right.
function LoadingAnimation() {
  this.timerId_ = 0;
  this.maxCount_ = 8;  // Total number of states in animation
  this.current_ = 0;  // Current state
  this.maxDot_ = 4;  // Max number of dots in animation
}

LoadingAnimation.prototype.paintFrame = function() {
  var text = "";
  for (var i = 0; i < this.maxDot_; i++) {
    text += (i == this.current_) ? "." : " ";
  }
  if (this.current_ >= this.maxDot_)
    text += "";

  this.current_++;
  if (this.current_ == this.maxCount_)
    this.current_ = 0;
}

LoadingAnimation.prototype.start = function() {
  if (this.timerId_)
    return;

  var self = this;
  this.timerId_ = window.setInterval(function() {
    self.paintFrame();
  }, 100);
}

LoadingAnimation.prototype.stop = function() {
  if (!this.timerId_)
    return;

  window.clearInterval(this.timerId_);
  this.timerId_ = 0;
}

function init() {
  canvas = document.getElementById('canvas');
  treeOpenImage = document.getElementById('tree_open');
  treeClosedImage = document.getElementById('tree_closed');
  treeNeitherImage = document.getElementById('tree_neither');
  canvasContext = canvas.getContext('2d');

  chrome.browserAction.setBadgeBackgroundColor({color:[208, 0, 24, 255]});
  chrome.browserAction.setIcon({path: "tree_is_unknown.png"});
  loadingAnimation.start();

  startRequest();
}

function scheduleRequest() {
  var randomness = Math.random() * 2;
  var exponent = Math.pow(2, requestFailureCount);
  var delay = Math.min(randomness * pollIntervalMin * exponent,
                       pollIntervalMax);
  delay = Math.round(delay);

  if (statusTimeoutId != null) {
    window.clearTimeout(statusTimeoutId);
  }
  statusTimeoutId = window.setTimeout(startRequest, delay);
}

// ajax stuff
function startRequest() {
  getTreeState(
    function(tstatus, message) {
      loadingAnimation.stop();
      updateTreeStatus(tstatus, message);
      scheduleRequest();
    },
    function() {
      loadingAnimation.stop();
      showTreeUnknown();
      scheduleRequest();
    }
  );
}

function getTreeState(onSuccess, onError) {
  var xhr = new XMLHttpRequest();
  var abortTimerId = window.setTimeout(function() {
    xhr.abort();  // synchronously calls onreadystatechange
  }, requestTimeout);

  function handleSuccess(status, message) {
    requestFailureCount = 0;
    window.clearTimeout(abortTimerId);
    if (onSuccess)
      onSuccess(status, message);
  }

  function handleError() {
    ++requestFailureCount;
    window.clearTimeout(abortTimerId);
    if (onError)
      onError();
  }

  try {
    xhr.onreadystatechange = function(){
      if (xhr.readyState != 4)
        return;

      if (xhr.responseText) {
        var resp;
        try {
          resp = JSON.parse(xhr.responseText);
        } catch(ex) {
          handleError();
        }

        if (resp.general_state != null && resp.general_state != "") {
          handleSuccess(resp.general_state, resp.message);
          return;
        } else {
          console.error(chrome.i18n.getMessage("chromebuildlcheck_node_error"));
        }
      }

      handleError();
    }

    xhr.onerror = function(error) {
      handleError();
    }

    xhr.open("GET", getChromeBuildUrl(), true);
    xhr.send(null);
  } catch(e) {
    console.error(chrome.i18n.getMessage("chromebuildcheck_exception", e));
    handleError();
  }
}


function updateTreeStatus(tstatus, message) {
  chrome.browserAction.setTitle({ 'title': message });
  /* chrome.browserAction.setBadgeText({text: message}); */
  if (treeStatus != tstatus) {
    treeStatus = tstatus;
    animateFlip();
  }
}


function ease(x) {
  return (1-Math.sin(Math.PI/2+x*Math.PI))/2;
}

function animateFlip() {
  rotation += 1/animationFrames;
  drawIconAtRotation();

  if (rotation <= 1) {
    setTimeout(animateFlip, animationSpeed);
  } else {
    rotation = 0;
    drawIconAtRotation();
    if (treeStatus == "open") {
      chrome.browserAction.setBadgeBackgroundColor({color:[0, 208, 24, 255]});
    } else if (treeStatus == "closed") {
      chrome.browserAction.setBadgeBackgroundColor({color:[208, 0, 24, 255]});
    } else {
      chrome.browserAction.setBadgeBackgroundColor({color:[208, 208, 24, 255]});
    }

  }
}

function showTreeUnknown() {
  treeStatus = "";
  chrome.browserAction.setIcon({path:"tree_is_unknown.png"});
  chrome.browserAction.setBadgeBackgroundColor({color:[190, 190, 190, 230]});
  chrome.browserAction.setTitle({ 'title': "Tree status is unknown" });
}

function drawIconAtRotation() {
  var img;
  if (treeStatus == "open") {
    img = treeOpenImage;
  } else if (treeStatus == "closed") {
    img = treeClosedImage;
  } else {
    img = treeNeitherImage;
  }
  canvasContext.save();
  canvasContext.clearRect(0, 0, canvas.width, canvas.height);
  canvasContext.translate(
      Math.ceil(canvas.width/2),
      Math.ceil(canvas.height/2));
  canvasContext.rotate(2*Math.PI*ease(rotation));
  canvasContext.drawImage(img,
      -Math.ceil(canvas.width/2),
      -Math.ceil(canvas.height/2));
  canvasContext.restore();

  chrome.browserAction.setIcon({imageData:canvasContext.getImageData(0, 0,
      canvas.width,canvas.height)});
}

function goToWaterfall() {
  chrome.tabs.getAllInWindow(undefined, function(tabs) {
    var wurl = waterfallUrl();
    for (var i = 0, tab; tab = tabs[i]; i++) {
      if (tab.url && tab.url == wurl) {
        chrome.tabs.update(tab.id, {url: tab.url, selected: true}, null);
        return;
      }
    }
    chrome.tabs.create({url: wurl});
  });
}

// Called when the user clicks on the browser action.
chrome.browserAction.onClicked.addListener(function(tab) {
  goToWaterfall();
  startRequest();
});

window.onload = init;
