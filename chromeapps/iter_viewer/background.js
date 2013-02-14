// Copyright (c) 2013 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

var cSize = 19;

// Which tabs are showing the icon
var showingTabs = [];
var running = false;
var timeLimit = 1000 * 60 * 60 * 24;  // 1 day in milliseconds

// Called when the url of a tab changes.
function checkForValidUrl(tabId, changeInfo, tab) {
  // If the letter 'g' is found in the tab's URL...
  if (tab.url.indexOf('/code.google.com/p/') > -1) {
    // ... show the page action.
    updateCanvas();
    var ctx = document.getElementById("canvas").getContext("2d");
    var imageData = ctx.getImageData(0, 0, cSize, cSize);
    chrome.pageAction.setIcon({"tabId":tab.id, "imageData":imageData});
    chrome.pageAction.show(tabId);
    if (showingTabs.indexOf(tab.id) < 0) {
      showingTabs.push(tab.id);
    }
    if (!running) {
      setTimeout(function() { UpdateAll(); }, timeLimit);
      running = true;
    }
  } else {
    TabClosed(tab.id);
  }
};

function UpdateAll() {
  if (showingTabs.length == 0) {
    return;
  }
  updateCanvas();
  var ctx = document.getElementById("canvas").getContext("2d");
  var imageData = ctx.getImageData(0, 0, cSize, cSize);
  for (var i = 0, e = showingTabs.length; i < e; i++) {
    chrome.pageAction.setIcon({"tabId":showingTabs[i], "imageData":imageData});
  }
  setTimeout("UpdateAll();", timeLimit);
}

function TabClosed(tabId, removeInfo) {
  var idx = showingTabs.indexOf(tabId);
  if (idx >= 0) {
    showingTabs.splice(idx, 1);
  }
}

// Listen for any changes to the URL of any tab.
chrome.tabs.onUpdated.addListener(checkForValidUrl);
chrome.tabs.onRemoved.addListener(TabClosed);

function getIter() {
  var now = (new Date()).getTime();
  var i37Begin = (new Date(2011, 7, 21, 0, 0, 0, 0)).getTime();
  var millisPerIter = 1000 * 60 * 60 * 24 * 14;
  var iter = 37 + (now - i37Begin)/millisPerIter;
  return iter;
}

function drawCorner(ctx, cornerX, cornerY, endX, endY) {
  ctx.beginPath();
  ctx.fillStyle = "rgba(255, 255, 255, 255)";
  ctx.moveTo(cornerX, cornerY);
  ctx.lineTo(cornerX, endY);
  ctx.bezierCurveTo(cornerX, endY/3 + cornerY * 2 / 3, endX/3 + cornerX * 2 / 3,
                    cornerY, endX, cornerY);
  ctx.lineTo(cornerX, cornerY);
  ctx.fill();
}

function updateCanvas() {
  var canvas = document.getElementById("canvas");
  if (!canvas.getContext)
    return;
  var ctx = canvas.getContext("2d");

  var topSize = 0;
  ctx.fillStyle = "rgba(0, 51, 0, 255)";
  ctx.fillRect(0, 0, cSize, topSize);
  // ctx.fillStyle = "rgba(208, 208, 208, 0.8)";
  // var topSide = 3;
  // ctx.fillRect(topSide, 1, cSize - 2 * topSide, 1);


  ctx.fillStyle = "#008000";
  ctx.fillRect(0, topSize, cSize, cSize - topSize);

  ctx.font = "bold 11pt Open Sans, sans-serif";
  ctx.fillStyle = "rgb(255, 255, 255)";
  ctx.shadowColor = "#000000";
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetX = 1;
  ctx.shadowBlur = 1;
  var iter = getIter();
  var intIter = Math.floor(iter);
  var progress = iter - intIter;
  ctx.fillText("" + intIter, 2, cSize * .8);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgb(0, 192, 0)";
  ctx.fillRect(0, cSize - 2, cSize * progress, 2);
  sz = 4;
  drawCorner(ctx, 0, 0, sz, sz);
  drawCorner(ctx, cSize, 0, cSize - sz, sz);
  drawCorner(ctx, 0, cSize, sz, cSize - sz);
  drawCorner(ctx, cSize, cSize, cSize - sz, cSize - sz);
}