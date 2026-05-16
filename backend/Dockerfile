# Gunakan Node.js versi 20 (atau sesuaikan dengan versi lokal Anda) dengan OS slim untuk image yang lebih ringan
FROM node:20-slim

# Install system dependencies yang dibutuhkan oleh onnxruntime atau package native lainnya
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory di dalam container
WORKDIR /app

# Salin file konfigurasi npm terlebih dahulu (memaksimalkan Docker cache)
COPY package*.json ./

# Install dependensi (termasuk onnxruntime-node untuk Linux)
RUN npm ci --only=production

# Salin seluruh kode backend dan dataset lokal
COPY . .

# Expose port 8080 (Cloud Run secara default mengekspos port 8080)
EXPOSE 8080

# Jalankan server
CMD ["npm", "start"]
