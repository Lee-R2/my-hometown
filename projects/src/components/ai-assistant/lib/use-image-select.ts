'use client';

import { useState, useCallback, type RefObject } from 'react';
import { toast } from 'sonner';
import { fileToBase64, validateImageFile, IMAGE_LIMITS } from './image-utils';

/**
 * 图片选择 Hook
 * 从 ai-assistant.tsx 提取，负责图片选择、预览和移除
 * @param fileInputRef - 文件输入框的 ref
 */
export function useImageSelect(fileInputRef: RefObject<HTMLInputElement | null>) {
  const [selectedImages, setSelectedImages] = useState<string[]>([]); // base64预览
  const [selectedImageFiles, setSelectedImageFiles] = useState<File[]>([]); // 原始文件

  const handleImageSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const currentCount = selectedImages.length;
      const filesToProcess = Array.from(files).slice(
        0,
        IMAGE_LIMITS.MAX_IMAGES - currentCount
      );

      if (filesToProcess.length === 0) {
        toast.error('最多只能上传3张图片');
        return;
      }

      // 检查文件大小
      for (const file of filesToProcess) {
        const error = validateImageFile(file);
        if (error) {
          toast.error(error);
          return;
        }
      }

      try {
        const base64Promises = filesToProcess.map((file) => fileToBase64(file));
        const base64Images = await Promise.all(base64Promises);

        setSelectedImages((prev) => [...prev, ...base64Images]);
        setSelectedImageFiles((prev) => [...prev, ...filesToProcess]);
        toast.success(`已添加 ${base64Images.length} 张图片`);
      } catch (error) {
        console.error('图片读取失败:', error);
        toast.error('图片读取失败，请重试');
      }

      // 清空 input 以便重复选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [selectedImages.length, fileInputRef]
  );

  const handleCameraCapture = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('capture', 'environment');
      fileInputRef.current.click();
      fileInputRef.current.removeAttribute('capture');
    }
  }, [fileInputRef]);

  const removeImage = useCallback((index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
    setSelectedImageFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearImages = useCallback(() => {
    setSelectedImages([]);
    setSelectedImageFiles([]);
  }, []);

  return {
    selectedImages,
    selectedImageFiles,
    handleImageSelect,
    handleCameraCapture,
    removeImage,
    clearImages,
  };
}
