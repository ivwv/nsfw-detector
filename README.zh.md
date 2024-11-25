# 🔍 Vue NSFW 检测器

[English](README.md) | [中文](README.zh.md)

一个强大且用户友好的 NSFW（不适合工作场所）内容检测工具，基于 Vue 3 和 Hugging Face Transformers 构建。该应用程序使用最先进的 AI 模型对视频和图像进行实时分析。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Vue](https://img.shields.io/badge/vue-3.x-brightgreen.svg)
![Vite](https://img.shields.io/badge/vite-latest-purple.svg)

## ✨ 特性

- 🎥 **视频分析**

  - 实时逐帧 NSFW 内容检测
  - 可调节的分析帧间隔
  - 交互式时间轴图表与详细结果
  - 注重隐私的视频预览模糊控制
  - 支持视频文件拖放上传

- 🖼️ **图片分析**

  - 快速单图 NSFW 检测
  - 使用交互式饼图展示结果
  - 支持图片拖放上传
  - 详细的置信度评分

- 🚀 **性能**

  - 自动设备检测（CPU/WebGPU）
  - 长视频进度跟踪
  - 可取消的分析过程
  - 适配所有屏幕尺寸的响应式设计

- 📊 **高级可视化**
  - 可自定义图表设置
  - 平滑的线条过渡
  - 数据点显示切换
  - 交互式缩放和平移控制

## 🛠️ 技术栈

- 使用 Composition API 的 Vue 3
- 使用 Vite 实现极速开发
- 使用 Hugging Face Transformers 进行 AI 模型推理
- 使用 ECharts 实现专业数据可视化
- 使用 TailwindCSS 实现现代化样式

## 🚀 快速开始

1. 克隆仓库：
