// Copyright (c) 2013 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

var customStatusTextbox;
var customWaterfallTextbox;
var saveButton;
var cancelButton;

window.onload = function() {
  customStatusTextbox = document.getElementById("custom-status");
  customWaterfallTextbox = document.getElementById("custom-waterfall");
  saveButton = document.getElementById("save-button");
  cancelButton = document.getElementById("cancel-button");

  customStatusTextbox.oninput = markDirty;
  customWaterfallTextbox.oninput = markDirty;
  saveButton.onclick = save;
  cancelButton.onclick = init;

  init();
};

function init() {
  customStatusTextbox.value = localStorage.customStatus || "";
  customWaterfallTextbox.value = localStorage.customWaterfall || "";
  markClean();
}

function save() {
  localStorage.customStatus = customStatusTextbox.value;
  localStorage.customWaterfall = customWaterfallTextbox.value;
  markClean();

  chrome.extension.getBackgroundPage().init();
}

function markDirty() {
  saveButton.disabled = false;
}

function markClean() {
  saveButton.disabled = true;
}
