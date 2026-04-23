#!/bin/bash
# watch-camera.sh — realtime view of every HTTP request hitting cctv-svc from
# the camera, plus the downstream event/clip processing. Run in its own
# terminal; Ctrl+C to quit.

tail -n 0 -F /tmp/dm3-logs/cctv.log \
 | grep --line-buffered -E '"path":"/VIID|body timing|tungson:|rolling buffer concat|clip extraction complete|extraction failed|falling back to live pull' \
 | while IFS= read -r line; do
     t=$(echo "$line" | grep -oE '"time":"[^"]+"' | head -1 | sed 's/"time":"//;s/"//' | cut -c12-19)
     msg=$(echo "$line" | grep -oE '"msg":"[^"]+"' | head -1 | sed 's/"msg":"//;s/"$//')
     path=$(echo "$line" | grep -oE '"path":"/VIID[^"]*"' | sed 's/"path":"//;s/"$//')
     dur=$(echo "$line" | grep -oE '"duration":"[^"]+"' | sed 's/"duration":"//;s/"$//')
     status=$(echo "$line" | grep -oE '"status":[0-9]+' | sed 's/"status"://')
     body=$(echo "$line" | grep -oE '"body_bytes":[0-9]+' | sed 's/"body_bytes"://')
     readms=$(echo "$line" | grep -oE '"read_ms":[0-9]+' | sed 's/"read_ms"://')
     cam=$(echo "$line" | grep -oE '"camera_device_id":"[0-9a-f-]+"' | sed 's/"camera_device_id":"//;s/"$//' | cut -c1-8)
     err=$(echo "$line" | grep -oE '"error":"[^"]+"' | sed 's/"error":"//;s/"$//' | cut -c1-50)
     lvl=$(echo "$line" | grep -oE '"level":"[^"]+"' | sed 's/"level":"//;s/"$//')

     case "$lvl" in
       ERROR) col="\033[31m" ;;
       WARN)  col="\033[33m" ;;
       *)     col="\033[36m" ;;
     esac

     if [ -n "$path" ]; then
         printf "${col}%s  REQ  %-40s  status=%s  dur=%s\033[0m\n" "$t" "$path" "${status:-?}" "${dur:-?}"
     elif [ -n "$body" ]; then
         printf "${col}%s  BODY body=%s bytes  read=%sms\033[0m\n" "$t" "$body" "$readms"
     elif [ -n "$cam" ]; then
         printf "${col}%s  %-60s  cam=%s  %s\033[0m\n" "$t" "${msg:0:60}" "$cam" "$err"
     else
         printf "${col}%s  %s  %s\033[0m\n" "$t" "$msg" "$err"
     fi
   done
