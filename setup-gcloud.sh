#!/bin/bash
# setup-gcloud.sh
# Script untuk setup awal Google Cloud Project untuk aplikasi Abjad.in

# Konfigurasi
PROJECT_ID="rapid-domain-495803-i8"
REGION="asia-southeast2"
BUCKET_NAME="abjadin-hashes-$PROJECT_ID" # Menambahkan project_id agar nama bucket unik secara global

echo "🚀 Memulai setup untuk project: $PROJECT_ID di region: $REGION"

# 1. Set Project
echo "📌 Set project ke $PROJECT_ID..."
gcloud config set project $PROJECT_ID

# 2. Set Region Default
echo "📌 Set default region ke $REGION..."
gcloud config set compute/region $REGION
gcloud config set run/region $REGION

# 3. Enable APIs
echo "📌 Mengaktifkan APIs yang dibutuhkan..."
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  safebrowsing.googleapis.com \
  webrisk.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com

# 4. Buat Firestore Database (native mode)
echo "📌 Membuat Firestore Database..."
gcloud firestore databases create --location=$REGION --type=firestore-native

# 5. Buat Cloud Storage Bucket
echo "📌 Membuat Cloud Storage bucket: $BUCKET_NAME..."
gcloud storage buckets create gs://$BUCKET_NAME --location=$REGION

# 6. Buat Secret Manager secrets (kosong)
SECRETS=(
  "GEMINI_API_KEY"
  "GOOGLE_SAFE_BROWSING_API_KEY"
  "WEB_RISK_API_KEY"
  "PHISHTANK_API_KEY"
  "BITLY_API_KEY"
  "WA_CLOUD_API_TOKEN"
  "WA_PHONE_NUMBER_ID"
  "WA_VERIFY_TOKEN"
  "HONEY_TOKEN_SECRET"
)

echo "📌 Membuat konfigurasi di Secret Manager (tanpa nilai awal)..."
for SECRET in "${SECRETS[@]}"; do
  # Cek apakah secret sudah ada
  if gcloud secrets describe "$SECRET" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "   [SKIP] Secret $SECRET sudah ada."
  else
    echo "   [CREATE] Secret $SECRET..."
    gcloud secrets create $SECRET --replication-policy="automatic"
  fi
done

echo "✅ Setup Infrastruktur Google Cloud Selesai!"
echo ""
echo "⚠️  Langkah Selanjutnya:"
echo "Kamu perlu mengisi nilai untuk setiap Secret Manager yang baru dibuat."
echo "Contoh cara mengisi secret via CLI:"
echo "echo -n 'API_KEY_KAMU' | gcloud secrets versions add GEMINI_API_KEY --data-file=-"
