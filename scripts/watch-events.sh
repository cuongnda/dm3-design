#!/bin/bash
# watch-events.sh — xem realtime flow xử lý event của CCTV.
# Chạy: bash scripts/watch-events.sh

# Extract chỉ các field quan trọng dùng sed+grep, không cần jq.
tail -n 200 -F /tmp/dm3-logs/cctv.log \
 | grep --line-buffered -E 'rolling buffer|clip extraction|face\.(match|unknown)|too small|capture clip|live pull ffmpeg starting|ffmpeg clip extraction failed|rule resolve|plugin check|findCameras|tungson:' \
 | while IFS= read -r line; do
     # Pull ra: time (HH:MM:SS), msg, camera_device_id (8 ký tự), clip_id (8 ký tự), error
     t=$(echo "$line" | grep -oE '"time":"[^"]+"' | sed 's/"time":"//;s/"//' | cut -c12-19)
     msg=$(echo "$line" | grep -oE '"msg":"[^"]+"' | sed 's/"msg":"//;s/"$//')
     cam=$(echo "$line" | grep -oE '"camera_device_id":"[^"]+"' | sed 's/"camera_device_id":"//;s/"$//' | cut -c1-8)
     clip=$(echo "$line" | grep -oE '"clip_id":"[^"]+"' | sed 's/"clip_id":"//;s/"$//' | cut -c1-8)
     err=$(echo "$line" | grep -oE '"error":"[^"]+"' | sed 's/"error":"//;s/"$//' | cut -c1-40)
     lvl=$(echo "$line" | grep -oE '"level":"[^"]+"' | sed 's/"level":"//;s/"$//')

     # Màu theo level
     case "$lvl" in
       ERROR) col="\033[31m" ;;   # đỏ
       WARN)  col="\033[33m" ;;   # vàng
       INFO)  col="\033[36m" ;;   # xanh
       *)     col="\033[0m"  ;;
     esac
     printf "${col}%s  %-70s  cam=%s  clip=%s  %s\033[0m\n" \
       "$t" "${msg:0:70}" "${cam:--}" "${clip:--}" "$err"
   done
