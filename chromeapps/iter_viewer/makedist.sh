#!/bin/bash -e
# Copyright (c) 2013 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

cd "${0%/*}"

rev=${1:-0}
if [[ $# -ne 1 || -n ${1//[0-9]} ]] ; then
  cat <<-EOF
Usage: makedist.sh <rev>

The ver will be taken from manifest.json.

The rev should be an integer.

Example:
 ./makedist.sh 1
This will generate a manifest for version 3.0.1 (when version is '3.0'
in the manifest.json file)
EOF
  exit 0
fi

ver=$(sed -nr '/"version"/s:.*"(.*)",$:\1:p' manifest.json)
PN="cros-iter-viewer"
PV="${ver}.${rev}"
P="${PN}-${PV}"

rm -rf ${P}
mkdir ${P}
git archive HEAD | tar xf - -C ${P}
sed -i \
  -e '/"version"/s:"[^"]*",:"'${PV}'",:' \
  ${P}/manifest.json

files=(
  manifest.json
  icon-128x128.png
  background.html
  background.js
)
zip="${P}.zip"
zip ${zip} "${files[@]/#/${P}/}"
rm -rf ${P}
du -b ${zip}
