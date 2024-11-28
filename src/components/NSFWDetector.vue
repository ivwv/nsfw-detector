<script setup>
import { ref, onMounted, onUnmounted, nextTick } from "vue";
import { pipeline, RawImage, env } from "@huggingface/transformers";
import * as echarts from "echarts";
// env.remoteHost = "https://p.ivwv.site/huggingface.co/";

const videoRef = ref(null);
const chartRef = ref(null);
const progressRef = ref(0);
const statusRef = ref("");
const chart = ref(null);
const deviceType = ref("wasm");
const frameInterval = ref(1); // 默认每秒处理一帧

// 配置参数
const CONFIG = {
  FRAME_INTERVAL: 1000, // 每秒取一帧
  MAX_CONCURRENT_FRAMES: 5,
};

let classifier = null;

// 添加新的 ref
const isVideoLoaded = ref(false);
const isProcessing = ref(false);
const shouldStop = ref(false);
const isDragging = ref(false);
const activeTab = ref("video"); // 'video' 或 'image'
const imageRef = ref(null);
const imageChartRef = ref(null);
const imageChart = ref(null);
const imageResults = ref(null);
const isImageProcessing = ref(false);
const isImageDragging = ref(false);

// 添加更多配置参数
const config = ref({
  frameInterval: 1, // 帧间隔（秒）
  chartSmoothing: true, // 是否平滑曲线
  showDataPoints: true, // 是否显示数据点
  videoBlur: 10, // 默认模糊度 (0-20)
  showBlur: true, // 是否启用模糊
});

onMounted(async () => {
  try {
    statusRef.value = "Loading model...";

    // 尝试检测可用的设备
    let device = "wasm"; // 默认使用 CPU

    try {
      if (navigator.gpu) {
        device = "webgpu";
      }
    } catch (e) {
      console.log("WebGPU not available, falling back to CPU");
    }

    deviceType.value = device;
    console.log(device, "device");

    classifier = await pipeline("image-classification", "AdamCodd/vit-base-nsfw-detector", {
      device: device,
      // dtype: "fp32", // 改用 float32 而不是 fp32
      quantized: false,
    });

    statusRef.value = "Model loaded";

    // 初始化 ECharts
    chart.value = echarts.init(chartRef.value);

    // 添加窗口大小变化的监听
    window.addEventListener("resize", () => {
      chart.value?.resize();
    });
  } catch (error) {
    statusRef.value = `Error loading model: ${error.message}`;
    console.error("Model loading error:", error);
  }
});

// 从视频中提取帧
async function extractFrames(video) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const frameResults = new Map();
  const interval = config.value.frameInterval * 1000; // 使用配置中的间隔
  const duration = video.duration * 1000;
  let processedTime = 0;

  try {
    for (let time = 0; time < duration; time += interval) {
      // 检查是否应该停止处理
      if (shouldStop.value) {
        statusRef.value = "Analysis stopped by user";
        break;
      }

      video.currentTime = time / 1000;
      await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));

      ctx.drawImage(video, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg"));
      const image = await RawImage.fromBlob(blob);

      const results = await classifier(image);
      const nsfwScore = results.find((r) => r.label === "nsfw")?.score || 0;
      const sfwScore = results.find((r) => r.label === "sfw")?.score || 0;

      const normalizedNsfwScore = nsfwScore / (nsfwScore + sfwScore);

      frameResults.set(time / 1000, {
        timestamp: (time / 1000).toFixed(2),
        nsfwScore: normalizedNsfwScore,
        rawNsfwScore: nsfwScore,
        rawSfwScore: sfwScore,
      });

      processedTime = time;
      // 更新进度，确最后能到达100%
      progressRef.value = Math.min((processedTime / duration) * 100, 99);
    }

    // 处理完成后设置为100%，仅在未被用户停止时
    if (!shouldStop.value) {
      progressRef.value = 100;
    }

    return Array.from(frameResults.values());
  } catch (error) {
    console.error("Error in extractFrames:", error);
    throw error;
  }
}

// 修改 generateChartConfig 函数
function generateChartConfig(frameResults) {
  const timestamps = frameResults.map((r) => formatTime(parseFloat(r.timestamp)));
  const nsfwScores = frameResults.map((r) => (r.nsfwScore * 100).toFixed(2));

  return {
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "line",
        animation: false,
      },
      formatter: function (params) {
        const param = params[0];
        const index = param.dataIndex;
        const rawData = frameResults[index];
        return `<div style="padding: 3px;">
                  <div>Time: ${param.axisValue}</div>
                  <div style="color: #ff4444;">
                    NSFW: ${param.data}%
                  </div>
                  <div style="font-size: 0.9em; color: #666;">
                    Raw NSFW: ${(rawData.rawNsfwScore * 100).toFixed(1)}%
                  </div>
                </div>`;
      },
      backgroundColor: "rgba(255, 255, 255, 0.9)",
      borderColor: "#ccc",
      borderWidth: 1,
      padding: [5, 10],
      textStyle: {
        color: "#333",
      },
      extraCssText: "box-shadow: 0 0 3px rgba(0, 0, 0, 0.3);",
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "15%",
      containLabel: true,
    },
    dataZoom: [
      {
        type: "slider",
        show: true,
        xAxisIndex: [0],
        start: 0,
        end: 100,
        height: 20,
        bottom: 0,
      },
      {
        type: "inside",
        xAxisIndex: [0],
      },
    ],
    xAxis: {
      type: "category",
      data: timestamps,
      axisLabel: {
        rotate: 45,
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
    },
    series: [
      {
        type: "line",
        data: nsfwScores,
        lineStyle: {
          color: "#ff4444",
          width: 2,
        },
        smooth: config.value.chartSmoothing,
        showSymbol: config.value.showDataPoints,
        symbolSize: 6,
      },
    ],
  };
}

// 添加时间格式化函数
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

// 修改文件处理函数
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const video = videoRef.value;
  video.src = URL.createObjectURL(file);

  // 重置状态
  isVideoLoaded.value = false;
  progressRef.value = 0;
  statusRef.value = "Video loaded. Click 'Start Analysis' to begin.";

  await new Promise((resolve) => video.addEventListener("loadedmetadata", resolve, { once: true }));
  isVideoLoaded.value = true;
}

// 修改 startAnalysis 函数
async function startAnalysis() {
  if (!videoRef.value || isProcessing.value) return;

  try {
    isProcessing.value = true;
    progressRef.value = 0;
    shouldStop.value = false; // 重置停止标志
    statusRef.value = "Analyzing video...";

    // 先销毁旧的实例
    if (chart.value) {
      chart.value.dispose();
    }

    const results = await extractFrames(videoRef.value);

    statusRef.value = "Processing complete, preparing chart...";

    // 延迟 2 秒渲染图表
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 重新初始化图表
    chart.value = echarts.init(chartRef.value);

    const option = generateChartConfig(results);
    chart.value.setOption(option);
    chart.value.setOption(option); // 调次以确保正确渲染

    statusRef.value = "Analysis complete";
  } catch (error) {
    console.error("Analysis error:", error);
    statusRef.value = `Error analyzing video: ${error.message}`;
  } finally {
    isProcessing.value = false;
  }
}

// 添加停止分析的函数
function stopAnalysis() {
  shouldStop.value = true;
  isProcessing.value = false;
}

// 添加组件卸载时的清理
onUnmounted(() => {
  if (chart.value) {
    chart.value.dispose();
    chart.value = null;
  }
  if (imageChart.value) {
    imageChart.value.dispose();
    imageChart.value = null;
  }
  // 移除 resize 监听器
  window.removeEventListener("resize", () => {
    chart.value?.resize();
  });
});

// 添加处理拖拽的函数
function handleDragEnter(e) {
  e.preventDefault();
  e.stopPropagation();
  isDragging.value = true;
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  isDragging.value = false;
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
}

async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  isDragging.value = false;

  const files = e.dataTransfer.files;
  if (files.length === 0) return;

  const file = files[0];
  // 检查是否为视频文件
  if (!file.type.startsWith("video/")) {
    statusRef.value = "Please drop a video file";
    return;
  }

  // 使用现有文件处理逻辑
  const video = videoRef.value;
  video.src = URL.createObjectURL(file);

  // 重置状态
  isVideoLoaded.value = false;
  progressRef.value = 0;
  statusRef.value = "Video loaded. Click 'Start Analysis' to begin.";

  await new Promise((resolve) => video.addEventListener("loadedmetadata", resolve, { once: true }));
  isVideoLoaded.value = true;
}

// 添加图片处理相关函数
async function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    statusRef.value = "Please select an image file";
    return;
  }

  imageRef.value = URL.createObjectURL(file);
  statusRef.value = 'Image loaded. Click "Analyze Image" to begin.';
}

async function analyzeImage() {
  if (!imageRef.value || isImageProcessing.value) return;

  try {
    isImageProcessing.value = true;
    statusRef.value = "Analyzing image...";

    // 创建一个临时的 Image 对象来加载图片
    const img = new Image();
    img.src = imageRef.value;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    // 使用 canvas 转换图片
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // 转换为 blob
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg"));
    const image = await RawImage.fromBlob(blob);

    const results = await classifier(image);

    const nsfwScore = results.find((r) => r.label === "nsfw")?.score || 0;
    const sfwScore = results.find((r) => r.label === "sfw")?.score || 0;

    imageResults.value = {
      nsfw: nsfwScore,
      sfw: sfwScore,
    };

    // 等待下一个 tick，确保 DOM 已更新
    await nextTick();

    // 确保 DOM 元素存在
    if (!imageChartRef.value) {
      throw new Error("Chart container not found");
    }

    // 初始化饼图
    if (imageChart.value) {
      imageChart.value.dispose();
    }

    // 延迟一点时间初始化图表
    await new Promise((resolve) => setTimeout(resolve, 100));

    imageChart.value = echarts.init(imageChartRef.value);

    const option = {
      tooltip: {
        trigger: "item",
        formatter: "{b}: {c}%",
      },
      legend: {
        orient: "horizontal",
        bottom: "bottom",
      },
      series: [
        {
          name: "Detection Results",
          type: "pie",
          radius: ["40%", "70%"],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: "#fff",
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: "{b}: {d}%",
          },
          emphasis: {
            label: {
              show: true,
              fontSize: "16",
              fontWeight: "bold",
            },
          },
          data: [
            {
              value: (nsfwScore * 100).toFixed(2),
              name: "NSFW",
              itemStyle: { color: "#ff4444" },
            },
            {
              value: (sfwScore * 100).toFixed(2),
              name: "SFW",
              itemStyle: { color: "#44bb44" },
            },
          ],
        },
      ],
    };

    imageChart.value.setOption(option);
    statusRef.value = "Image analysis complete";
  } catch (error) {
    console.error("Image analysis error:", error);
    statusRef.value = `Error analyzing image: ${error.message}`;
  } finally {
    isImageProcessing.value = false;
  }
}

// 修改拖拽处理函数
function handleImageDragEnter(e) {
  e.preventDefault();
  e.stopPropagation();
  // 只有在没有图片时才显示拖拽状态
  if (!imageRef.value) {
    isImageDragging.value = true;
  }
}

function handleImageDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  isImageDragging.value = false;
}

function handleImageDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
}

async function handleImageDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  isImageDragging.value = false;

  // 阻止冒泡，防止触发浏览器默认的打开行为
  if (e.stopImmediatePropagation) {
    e.stopImmediatePropagation();
  }

  const files = e.dataTransfer.files;
  if (files.length === 0) return;

  const file = files[0];
  if (!file.type.startsWith("image/")) {
    statusRef.value = "Please drop an image file";
    return;
  }

  // 释放之前的 URL，避免内存泄漏
  if (imageRef.value) {
    URL.revokeObjectURL(imageRef.value);
  }

  imageRef.value = URL.createObjectURL(file);
  statusRef.value = 'Image loaded. Click "Analyze Image" to begin.';
}
</script>

<template>
  <div class="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="max-w-5xl mx-auto">
      <!-- 标题区域 -->
      <div class="text-center mb-8">
        <h2 class="text-3xl font-bold text-gray-900 sm:text-4xl">NSFW Detector</h2>
        <div class="mt-2 text-sm font-medium text-gray-600">
          Running on: <span class="text-primary">{{ deviceType }}</span>
        </div>
      </div>

      <!-- 在标题区域下方添加 -->
      <div class="mb-6">
        <div class="border-b border-gray-200">
          <nav class="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              v-for="tab in [
                { id: 'video', name: 'Video Detection' },
                { id: 'image', name: 'Image Detection' },
              ]"
              :key="tab.id"
              @click="activeTab = tab.id"
              :class="[
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm',
              ]"
            >
              {{ tab.name }}
            </button>
          </nav>
        </div>
      </div>

      <!-- 在原有内容外包裹一层 v-show -->
      <div v-show="activeTab === 'video'">
        <!-- 控制区域 -->
        <div class="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div class="space-y-6">
            <!-- 基本设置 -->
            <div>
              <h3 class="text-lg font-medium text-gray-900 mb-4">Analysis Settings</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- 帧间隔设置 -->
                <div class="space-y-2">
                  <label for="frameInterval" class="block text-sm font-medium text-gray-700">
                    Frame Interval (seconds)
                  </label>
                  <input
                    type="number"
                    id="frameInterval"
                    v-model="config.frameInterval"
                    min="0.1"
                    max="10"
                    step="0.1"
                    :disabled="isProcessing"
                    class="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                  />
                  <p class="text-xs text-gray-500">Time between each frame analysis (0.1-10s)</p>
                </div>
              </div>
            </div>

            <!-- 图表设置 -->
            <div>
              <h3 class="text-lg font-medium text-gray-900 mb-4">Chart Settings</h3>
              <div class="flex flex-wrap gap-6">
                <!-- 平滑曲线选项 -->
                <label class="inline-flex items-center">
                  <input
                    type="checkbox"
                    v-model="config.chartSmoothing"
                    :disabled="isProcessing"
                    class="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span class="ml-2 text-sm text-gray-700">Smooth Line</span>
                </label>

                <!-- 显示数据点选项 -->
                <label class="inline-flex items-center">
                  <input
                    type="checkbox"
                    v-model="config.showDataPoints"
                    :disabled="isProcessing"
                    class="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span class="ml-2 text-sm text-gray-700">Show Data Points</span>
                </label>
              </div>
            </div>

            <!-- 视频模糊控制 -->
            <div>
              <h3 class="text-lg font-medium text-gray-900 mb-4">Video Display Settings</h3>
              <div class="space-y-4">
                <!-- 启用/禁用模糊 -->
                <label class="inline-flex items-center">
                  <input
                    type="checkbox"
                    v-model="config.showBlur"
                    class="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span class="ml-2 text-sm text-gray-700">Enable Blur Effect</span>
                </label>

                <!-- 模糊度控制 -->
                <div class="space-y-2" v-show="config.showBlur">
                  <label class="flex items-center justify-between">
                    <span class="block text-sm font-medium text-gray-700">Blur Intensity</span>
                    <span class="text-sm text-gray-500">{{ config.videoBlur }}</span>
                  </label>
                  <input
                    type="range"
                    v-model="config.videoBlur"
                    min="0"
                    max="100"
                    step="1"
                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div class="flex justify-between text-xs text-gray-500">
                    <span>Clear</span>
                    <span>Fully Blurred</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 文件上传和分析按钮 -->
            <div class="flex flex-wrap items-center gap-4">
              <label
                class="relative cursor-pointer bg-white rounded-md font-medium text-primary hover:text-primary-dark focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary"
              >
                <span
                  class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Choose Video
                </span>
                <input
                  type="file"
                  accept="video/*"
                  @change="handleFileUpload"
                  :disabled="isProcessing"
                  class="sr-only"
                />
              </label>
              <button
                @click="startAnalysis"
                :disabled="!isVideoLoaded || isProcessing"
                class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-gray-300 disabled:cursor-not-allowed min-w-[120px] justify-center"
              >
                <svg
                  v-if="isProcessing"
                  class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                {{ isProcessing ? "Processing..." : "Start Analysis" }}
              </button>
              <button
                v-if="isProcessing"
                @click="stopAnalysis"
                class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 min-w-[120px] justify-center"
              >
                <svg
                  class="-ml-1 mr-2 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                Stop Analysis
              </button>
            </div>
          </div>
        </div>

        <!-- 视频预览 -->
        <div class="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div
            class="video-container relative"
            @dragenter="handleDragEnter"
            @dragleave="handleDragLeave"
            @dragover="handleDragOver"
            @drop="handleDrop"
            :class="{ 'drag-active': isDragging }"
          >
            <video
              ref="videoRef"
              controls
              class="w-full h-auto max-h-[600px] mx-auto rounded-lg object-contain"
              :class="{ 'video-blur': config.showBlur }"
              :style="{ '--blur-amount': `${config.videoBlur}px` }"
            ></video>

            <!-- 添加提示文本 -->
            <div
              v-if="config.showBlur"
              class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-lg font-semibold bg-black bg-opacity-50 px-4 py-2 rounded-lg pointer-events-none"
            >
              Video Preview Blurred
            </div>

            <!-- 拖拽提示遮罩 -->
            <div
              v-if="isDragging"
              class="absolute inset-0 bg-primary bg-opacity-50 flex items-center justify-center rounded-lg"
            >
              <div class="text-white text-xl font-semibold">
                <svg
                  class="mx-auto h-12 w-12 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3 3m0 0l-3-3m3 3V8"
                  />
                </svg>
                Drop video file here
              </div>
            </div>
          </div>
        </div>

        <!-- 状态和进度 -->
        <div class="space-y-4 mb-6">
          <div
            class="p-4 rounded-md"
            :class="{
              'bg-blue-50 text-blue-700': !isProcessing,
              'bg-yellow-50 text-yellow-700': isProcessing,
            }"
          >
            {{ statusRef }}
          </div>

          <div v-if="progressRef > 0" class="relative pt-1">
            <div class="overflow-hidden h-2 text-xs flex rounded bg-gray-200">
              <div
                :style="{ width: progressRef + '%' }"
                class="transition-all duration-300 ease-out shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-primary"
              ></div>
            </div>
            <div class="text-right mt-1">
              <span class="text-sm font-semibold text-primary">{{ Math.round(progressRef) }}%</span>
            </div>
          </div>
        </div>

        <!-- 图表 -->
        <div class="bg-white rounded-lg shadow-sm p-6">
          <div ref="chartRef" class="w-full h-[500px]"></div>
        </div>
      </div>

      <!-- 添加图片检测内容 -->
      <div v-show="activeTab === 'image'" class="space-y-6">
        <!-- 图片上传和分析区域 -->
        <div class="bg-white rounded-lg shadow-sm p-6">
          <div class="space-y-6">
            <div class="flex flex-wrap items-center gap-4">
              <label
                class="relative cursor-pointer bg-white rounded-md font-medium text-primary hover:text-primary-dark focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary"
              >
                <span
                  class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Choose Image
                </span>
                <input
                  type="file"
                  accept="image/*"
                  @change="handleImageUpload"
                  :disabled="isImageProcessing"
                  class="sr-only"
                />
              </label>
              <button
                @click="analyzeImage"
                :disabled="!imageRef || isImageProcessing"
                class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <svg
                  v-if="isImageProcessing"
                  class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                {{ isImageProcessing ? "Analyzing..." : "Analyze Image" }}
              </button>
            </div>
          </div>
        </div>

        <!-- 图片预览 -->
        <div
          class="bg-white rounded-lg shadow-sm p-6"
          @dragenter="handleImageDragEnter"
          @dragleave="handleImageDragLeave"
          @dragover="handleImageDragOver"
          @drop="handleImageDrop"
          :class="{ 'drag-active': isImageDragging }"
        >
          <div class="image-preview relative">
            <img
              v-if="imageRef"
              :src="imageRef"
              class="max-h-[400px] mx-auto rounded-lg object-contain"
              alt="Preview"
            />

            <!-- 添加拖拽提示 -->
            <div v-if="!imageRef && !isImageDragging" class="text-gray-500 text-center p-8">
              <div class="text-lg font-medium">Drop an image here or click to upload</div>
              <div class="text-sm mt-2">Supports JPG, PNG, GIF</div>
            </div>

            <!-- 拖拽激活时的提示 -->
            <div
              v-if="isImageDragging && !imageRef"
              class="absolute inset-0 bg-primary bg-opacity-50 flex items-center justify-center rounded-lg"
            >
              <div class="text-white text-xl font-semibold">
                <svg
                  class="mx-auto h-12 w-12 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3 3m0 0l-3-3m3 3V8"
                  />
                </svg>
                Drop image file here
              </div>
            </div>
          </div>
        </div>

        <!-- 分析结果图表 -->
        <div class="bg-white rounded-lg shadow-sm p-6" v-if="imageResults">
          <div ref="imageChartRef" class="w-full h-[400px]"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
@tailwind base;
@tailwind components;
@tailwind utilities;

/* 添加一些自定义样式 */
.chart-container {
  @apply relative w-full overflow-hidden;
}

input[type="number"] {
  @apply px-3 py-2 border border-gray-300 rounded-md;
}

.video-container {
  @apply flex justify-center items-center max-h-[600px] overflow-hidden relative;
  @apply bg-gray-50;
  min-height: 300px; /* 确保容器有最小高度 */
}

.drag-active {
  @apply ring-2 ring-primary ring-opacity-50;
}

.video-container video {
  @apply max-w-full max-h-[600px] object-contain;
  @apply transition-all duration-300;
}

/* 当拖拽激活时，稍微缩小视频 */
.drag-active video {
  @apply scale-95;
}

/* 添加模糊效果样式 */
.video-blur {
  filter: blur(var(--blur-amount));
  transition: filter 0.3s ease;
}

/* 修改 range 输入框样式 */
input[type="range"] {
  @apply appearance-none bg-gray-200 h-2 rounded-lg;
}

input[type="range"]::-webkit-slider-thumb {
  @apply appearance-none w-4 h-4 bg-primary rounded-full cursor-pointer transition-colors;
}

input[type="range"]::-webkit-slider-thumb:hover {
  @apply bg-primary-dark;
}

input[type="range"]::-moz-range-thumb {
  @apply w-4 h-4 bg-primary border-none rounded-full cursor-pointer transition-colors;
}

input[type="range"]::-moz-range-thumb:hover {
  @apply bg-primary-dark;
}

/* 确保模糊效果不影响控件可用性 */
.video-container {
  @apply relative isolate;
}

.video-container video {
  @apply z-10;
}

.video-container .plyr {
  @apply z-20;
}

/* 添加图片预览容器样式 */
.image-preview {
  @apply flex justify-center items-center bg-gray-50 rounded-lg overflow-hidden relative;
  min-height: 300px;
}

.image-preview img {
  @apply transition-all duration-300;
}

/* 拖拽时的图片缩放效果 */
.drag-active .image-preview img {
  @apply scale-95;
}

/* 添加图表容器样式 */
.chart-wrapper {
  @apply bg-white rounded-lg shadow-sm p-6;
  min-height: 400px;
}
</style>
