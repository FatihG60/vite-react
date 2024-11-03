import React, { useState } from "react";
import {
  FileUpload,
  FileUploadProps,
  FileUploadSelectEvent,
  ItemTemplateOptions,
} from "primereact/fileupload";
import axios, { CancelTokenSource } from "axios";
import { Button } from "primereact/button";
import { ProgressBar } from "primereact/progressbar";

interface FileUploadItem {
  file: File;
  uploadedBytes: number;
  isPaused: boolean;
  cancelTokenSource: CancelTokenSource | null;
}

const S3FileUploader = () => {
  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
  const presignedUrl = "https://your-s3-presigned-url"; // Presigned URL buraya eklenecek

  const uploadChunk = async (item: FileUploadItem) => {
    const start = item.uploadedBytes;
    const end = Math.min(start + CHUNK_SIZE, item.file.size);
    const blob = item.file.slice(start, end);
    const cancelSource = axios.CancelToken.source();
    item.cancelTokenSource = cancelSource;

    try {
      await axios.put(presignedUrl, blob, {
        headers: {
          "Content-Range": `bytes ${start}-${end - 1}/${item.file.size}`,
          "Content-Type": item.file.type,
        },
        cancelToken: cancelSource.token,
        onUploadProgress: (progressEvent) => {
          const bytesUploaded = start + progressEvent.loaded;
          updateFile(item.file.name, { uploadedBytes: bytesUploaded });
        },
      });
      updateFile(item.file.name, { uploadedBytes: end });
      return end;
    } catch (error) {
      if (axios.isCancel(error)) {
        console.log("Upload paused for", item.file.name);
      } else {
        console.error("Upload error for", item.file.name, ":", error);
      }
      return null;
    }
  };

  const handleUpload = async (fileItem: FileUploadItem) => {
    let position = fileItem.uploadedBytes;
    while (position < fileItem.file.size && !fileItem.isPaused) {
      const nextPosition = await uploadChunk(fileItem);
      if (nextPosition === null) break; // Hata oluştuysa veya duraklatıldıysa
      position = nextPosition;
    }
    if (position >= fileItem.file.size) {
      console.log("Upload completed for", fileItem.file.name);
      updateFile(fileItem.file.name, { uploadedBytes: fileItem.file.size });
    }
  };

  const handleFileSelect = (e: FileUploadSelectEvent) => {
    const selectedFiles = Array.from(e.files).map((file) => ({
      file,
      uploadedBytes: 0,
      isPaused: false,
      cancelTokenSource: null,
    }));
    setFiles((prevFiles) => [...prevFiles, ...selectedFiles]);
  };

  const updateFile = (
    fileName: string,
    updatedProps: Partial<FileUploadItem>
  ) => {
    setFiles((prevFiles) =>
      prevFiles.map((file) =>
        file.file.name === fileName ? { ...file, ...updatedProps } : file
      )
    );
  };

  const handlePause = (fileName: string) => {
    const fileItem = files.find((file) => file.file.name === fileName);
    if (fileItem && fileItem.cancelTokenSource) {
      fileItem.cancelTokenSource.cancel();
      updateFile(fileName, { isPaused: true });
    }
  };

  const handleResume = (fileName: string) => {
    updateFile(fileName, { isPaused: false });
    const fileItem = files.find((file) => file.file.name === fileName);
    if (fileItem) {
      handleUpload(fileItem);
    }
  };

  const handleCancel = (fileName: string) => {
    const fileItem = files.find((file) => file.file.name === fileName);
    if (fileItem && fileItem.cancelTokenSource) {
      fileItem.cancelTokenSource.cancel();
    }
    setFiles((prevFiles) =>
      prevFiles.filter((file) => file.file.name !== fileName)
    );
  };

  const uploadHandler = async (event: any) => {
    const uploadedFiles = event.files;
    uploadedFiles.forEach((file: File) => {
      const fileItem = {
        file,
        uploadedBytes: 0,
        isPaused: false,
        cancelTokenSource: null,
      };
      setFiles((prevFiles) => [...prevFiles, fileItem]);
      handleUpload(fileItem); // Yüklemeyi başlat
    });
  };

  const handleDownload = async (fileName: string) => {
    const fileItem = files.find((file) => file.file.name === fileName);
    if (!fileItem) return;

    try {
      // İndirme işlemini başlatmak için presigned URL kullanarak GET isteği yapın
      const response = await axios.get(presignedUrl, {
        responseType: "blob", // Dosya olarak indirmek için
      });

      // Blob'u kullanıcıya indirme olarak sunun
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      console.error("Download error:", error);
    }
  };

  const itemTemplate = (file: object, options: ItemTemplateOptions) => {
    const fileItem = files.find(
      (item) => item.file.name === (file as File).name
    );
    const progressPercentage = fileItem
      ? Math.min((fileItem.uploadedBytes / fileItem.file.size) * 100, 100)
      : 0;

    return (
      <div
        className="p-fileupload-row"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "8px 0",
        }}
      >
        {/* Dosya Adı */}
        <div
          style={{ flex: "1", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          <strong>{(file as File).name}</strong>
        </div>

        {/* İlerleme Çubuğu */}
        <ProgressBar
          value={progressPercentage}
          style={{ width: "200px", height: "8px" }}
        />

        {/* Yüklenen Bayt */}
        <div style={{ width: "100px", textAlign: "center", fontSize: "12px" }}>
          {(fileItem?.uploadedBytes || 0) / 1024} KB /{" "}
          {(fileItem?.file.size || 0) / 1024} KB
        </div>

        {/* Düğmeler */}
        <Button
          icon="pi pi-pause"
          onClick={() => handlePause((file as File).name)}
          disabled={fileItem?.isPaused || false}
          className="p-button-rounded p-button-text p-button-warning"
          tooltip="Pause"
          tooltipOptions={{ position: "top" }}
        />

        <Button
          icon="pi pi-play"
          onClick={() => handleResume((file as File).name)}
          disabled={!fileItem?.isPaused}
          className="p-button-rounded p-button-text p-button-success"
          tooltip="Resume"
          tooltipOptions={{ position: "top" }}
        />

        <Button
          icon="pi pi-times"
          onClick={() => handleCancel((file as File).name)}
          className="p-button-rounded p-button-text p-button-danger"
          tooltip="Cancel"
          tooltipOptions={{ position: "top" }}
        />

        <Button
          icon="pi pi-download"
          onClick={() => handleDownload((file as File).name)}
          className="p-button-rounded p-button-text p-button-info"
          tooltip="Download"
          tooltipOptions={{ position: "top" }}
        />
      </div>
    );
  };

  return (
    <div>
      <FileUpload
        customUpload
        multiple
        onSelect={handleFileSelect}
        uploadHandler={uploadHandler} // uploadHandler kullanılıyor
        itemTemplate={itemTemplate}
        chooseLabel="Choose"
        uploadLabel="Upload"
        cancelLabel="Pause"
      />
    </div>
  );
};

export default S3FileUploader;
