#!/bin/bash -e
# Copyright (c) 2013 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

ver=${1#v}
rev=${2:-0}
if [[ -z ${ver} ]] ; then
  cat <<-EOF
Usage: makedist.sh <ver> [rev]

The ver should be a git tag.

The rev should be an integer.

Example:
 ./makedist.sh 3.0 1
This will generate a manifest for version 3.0.1 from the git tag v3.0
EOF
fi
gtag="v${ver}"

PN="cros-iter-viewer"
PV="${ver}.${rev}"
P="${PN}-${PV}"

rm -rf ${P}
mkdir ${P}
git archive --prefix=${P}/ ${gtag} | tar xf -
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
