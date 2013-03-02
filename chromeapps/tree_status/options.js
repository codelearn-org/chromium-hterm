// Copyright (c) 2013 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

var customStatusTextbox;
var customWaterfallTextbox;
var onClickBehaviorCheckbox;
var saveButton;
var cancelButton;

window.onload = function() {
  customStatusTextbox = document.getElementById("custom-status");
  customWaterfallTextbox = document.getElementById("custom-waterfall");
  onClickBehaviorCheckbox = document.getElementById("onclick-behavior");
  saveButton = document.getElementById("save-button");
  cancelButton = document.getElementById("cancel-button");

  customStatusTextbox.oninput = markDirty;
  customWaterfallTextbox.oninput = markDirty;
  onClickBehaviorCheckbox.onclick = markDirty;
  saveButton.onclick = save;
  cancelButton.onclick = init;

  init();
};

function init() {
  customStatusTextbox.value = localStorage.customStatus || "";
  customWaterfallTextbox.value = localStorage.customWaterfall || "";
  onClickBehaviorCheckbox.checked = localStorage.onClickBehavior != "reuse";
  markClean();
}

function save() {
  localStorage.customStatus = customStatusTextbox.value;
  localStorage.customWaterfall = customWaterfallTextbox.value;
  localStorage.onClickBehavior =
    onClickBehaviorCheckbox.checked ? "newtab" : "reuse";
  markClean();

  chrome.extension.getBackgroundPage().init();
}

function markDirty() {
  saveButton.disabled = false;
}

function markClean() {
  saveButton.disabled = true;
}
