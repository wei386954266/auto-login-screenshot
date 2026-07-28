#!/usr/bin/env bash
# 下载中文字体到 fc/code/fonts/（部署前执行一次即可）
# FC 运行环境没有中文字体，截图中文会显示为方框，必须随代码包携带字体
set -e
cd "$(dirname "$0")/code/fonts"

if [ -f wqy-microhei.ttc ]; then
  echo "字体已存在，跳过下载"
  exit 0
fi

echo "下载文泉驿微米黑字体..."
curl -fL -o wqy-microhei.ttc \
  https://github.com/anthonyfok/fonts-wqy-microhei/raw/master/wqy-microhei.ttc

echo "完成: $(ls -lh wqy-microhei.ttc | awk '{print $5}')"
