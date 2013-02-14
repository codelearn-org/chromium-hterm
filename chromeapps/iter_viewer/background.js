// Copyright (c) 2013 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/*
 * Overall design tradeoffs
 *
 * The previous code worked by:
 *  - listen to chrome.tabs.onUpdated
 *  - listen to chrome.tabs.onRemoved
 *  - keep global state of active tabs
 *  - use setTimeout timer to update active tabs
 * The problem with these is that they have no URL filtering system.  That
 * means we get called on every tab update/close and not the google tracker
 * ones.  We also have to stay resident the entire time even if we're never
 * used.  Very simple to implement, but runtime overhead is annoying.
 *
 * The current code has been reworked to use the new event system:
 *  - listen to chrome.webNavigation.onCommitted
 *  - use chrome.alarms to update active tabs
 *  - no global state
 * This allows us to use URL filters which Chrome itself processes so we
 * never get called on tabs we don't care about.  It also allows Chrome to
 * shutdown the background state page after some time and free up resources.
 * The downside is that we no longer can rely on global state, and we don't
 * have an event to rely on when the tab is closed.
 */

/*
 * Current codeflow
 *
 * First we listen for new tabs with a URL filter.  This way we can assume
 * when we get called, we always want to generate the tab.
 *
 * Then we set an alarm to fire just after the iteration starts.  Since we
 * don't have global state, we have to pack the tabId into the name of the
 * alarm itself.  Then when the alarm fires, we unpack the tabId and update
 * its icon.
 *
 * Since we no longer listen to tab close events, we have to make the alarm
 * code ignore tabs that no longer exist and then clear themselves.  This
 * runs the risk of a lot of chrome alarms being active (one per new tab that
 * visits a tracker) for tabs that have been closed.  For now, we handle this
 * by setting an alarm that runs "soon" after a new tab has been created that
 * cleans up all old alarms.  This should provide "good enough" coverage.
 *
 * Note: There is a bug where the icon doesn't get set when a page that
 * gets instant loaded in the bg when the current page is the NTP.  See
 * http://crbug.com/168630
 */

/*
 * Main event / alarm logic.
 */

function tabIdToAlarmName(tabId) {
  // Pack the tabid into the name :)
  return 'refresh CrOS iteration icons:' + tabId;
}

function alarmNameToTabId(alarmName) {
  return parseInt(alarmName.split(':')[1]);
}

// When visiting a tracker page, show the icon.
chrome.webNavigation.onCommitted.addListener(function(e) {
  // Set an alarm to update icon when the iteration changes.
  chrome.alarms.create(tabIdToAlarmName(e.tabId), {
    'when': iterToTime(getIter() + 1),
    'periodInMinutes': millisPerIter() / 1000 / 60
  });

  /*
   * Set the reaper alarm to run once in the near future.  Yes, this will reset
   * a previous reaper alarm, but that's OK.  This isn't super important.
   */
  chrome.alarms.create('reaper', {
    'delayInMinutes': 10
  });

  setIcon(e.tabId);
}, {url: [{hostEquals: 'code.google.com'},
          {pathPrefix: '/p/'}]});

chrome.alarms.onAlarm.addListener(function(alarm) {
  var tabId = alarmNameToTabId(alarm.name);
  if (isNaN(tabId)) {
    // This is the reaper alarm.  Reap alarms for dead tabs.
    chrome.alarms.getAll(function(alarms) {
      alarms.forEach(function(alarm) {
        var tabId = alarmNameToTabId(alarm.name);
        chrome.tabs.get(tabId, function(tab) {
          if (typeof(tab) == "undefined") {
            console.log('OK to ignore previous error related to tab ' + tabId);
            chrome.alarms.clear(alarm.name);
          }
        });
      });
    });
    return;
  }

  /*
   * Make sure the tab still exists.  We do this since there is no event
   * we can listen to that'll allow us to unregister.  We cannot use the
   * chrome.tabs.onRemoved event as that'll end up waking up this page
   * on *every* tab closure.  Better to just let an alarm in the distant
   * future clean ourselves up.
   */
  chrome.tabs.get(tabId, function(tab) {
    if (typeof(tab) == "undefined") {
      /*
       * We could use chrome.windows.getAll and walk all ids ourself, but
       * why bother when this is a lot less code and few people look at
       * the javascript console for errors.
       */
      console.log('OK to ignore previous error related to tab ' + tabId);
      chrome.alarms.clear(alarm.name);
    } else {
      setIcon(tabId);
    }
  });
});

/*
 * Iteration/time code.
 */

function millisPerIter() {
  // Iterations last 14 days.
  return 1000 * 60 * 60 * 24 * 14;
}

function iterToTime(iter) {
  var i37Begin = (new Date(2011, 7, 22, 0, 0, 0, 0)).getTime();
  return Math.floor(i37Begin + (millisPerIter() * (iter - 37)));
}

function getIter() {
  var i37Begin = (new Date(2011, 7, 22, 0, 0, 0, 0)).getTime();
  var iter = 37 + (Date.now() - i37Begin) / millisPerIter();
  return Math.floor(iter);
}

/*
 * Drawing code.
 */

function setIcon(tabId) {
  updateCanvas();
  var canvas = document.getElementById("canvas")
  var ctx = canvas.getContext("2d");
  var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  chrome.pageAction.setIcon({"tabId":tabId, "imageData":imageData});
  chrome.pageAction.show(tabId);
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
  ctx.fillRect(0, 0, canvas.width, topSize);
  // ctx.fillStyle = "rgba(208, 208, 208, 0.8)";
  // var topSide = 3;
  // ctx.fillRect(topSide, 1, canvas.width - 2 * topSide, 1);

  ctx.fillStyle = "#008000";
  ctx.fillRect(0, topSize, canvas.width, canvas.height - topSize);

  ctx.font = "bold 11pt Open Sans, sans-serif";
  ctx.fillStyle = "rgb(255, 255, 255)";
  ctx.shadowColor = "#000000";
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetX = 1;
  ctx.shadowBlur = 1;
  var iter = getIter();
  var intIter = Math.floor(iter);
  var progress = iter - intIter;
  ctx.fillText("" + intIter, 2, canvas.height * .8);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgb(0, 192, 0)";
  ctx.fillRect(0, canvas.height - 2, canvas.width * progress, 2);
  sz = 4;
  drawCorner(ctx, 0, 0, sz, sz);
  drawCorner(ctx, canvas.width, 0, canvas.width - sz, sz);
  drawCorner(ctx, 0, canvas.height, sz, canvas.height - sz);
  drawCorner(ctx, canvas.width, canvas.height, canvas.width - sz,
             canvas.height - sz);
}
