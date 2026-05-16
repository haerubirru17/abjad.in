import pandas as pd
import numpy as np
import re
from urllib.parse import urlparse
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import skl2onnx
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
import warnings
warnings.filterwarnings('ignore')

print("1. Membaca dataset...")
df = pd.read_csv(r'c:\Abjadin\datasets\PhiUSIIL_Phishing_URL_Dataset.csv')

# Label mapping: PhiUSIIL dataset: 1 = Legitimate, 0 = Phishing
# Kita ubah agar 1 = Phishing, 0 = Legitimate (lebih natural untuk deteksi ancaman)
df['label'] = df['label'].apply(lambda x: 1 if x == 0 else 0)

print(f"Total data: {len(df)}")
print(f"Distribusi kelas (1=Phishing, 0=Aman): \n{df['label'].value_counts()}")

# Fitur leksikal murni yang bisa dihitung secara instan (tanpa fetch HTML)
features = [
    'URLLength', 
    'DomainLength', 
    'IsDomainIP', 
    'NoOfSubDomain', 
    'NoOfLettersInURL', 
    'LetterRatioInURL', 
    'NoOfDegitsInURL', 
    'DegitRatioInURL', 
    'NoOfEqualsInURL', 
    'NoOfQMarkInURL', 
    'NoOfAmpersandInURL', 
    'NoOfOtherSpecialCharsInURL', 
    'SpacialCharRatioInURL', 
    'IsHTTPS'
]

X = df[features]
y = df['label']

# Mengisi NaN jika ada (seharusnya tidak ada di PhiUSIIL)
X.fillna(0, inplace=True)

print("2. Split dataset untuk training dan testing (80:20)...")
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

print("3. Melatih model Random Forest...")
# Gunakan n_estimators=50 dan max_depth=15 untuk model yang ringan & cepat inferensi
model = RandomForestClassifier(n_estimators=50, max_depth=15, random_state=42, n_jobs=-1)
model.fit(X_train, y_train)

print("4. Evaluasi Model...")
y_pred = model.predict(X_test)
print(f"Akurasi: {accuracy_score(y_test, y_pred) * 100:.2f}%")
print(classification_report(y_test, y_pred))

print("5. Exporting ke format ONNX...")
# Define input type untuk ONNX: Float tensor array dengan panjang = jumlah fitur
initial_type = [('float_input', FloatTensorType([None, len(features)]))]
onx = convert_sklearn(model, initial_types=initial_type, options={id(model): {'zipmap': False}})

output_path = r'c:\Abjadin\backend\scripts\phishing_lexical_rf.onnx'
with open(output_path, "wb") as f:
    f.write(onx.SerializeToString())

print(f"Model berhasil diexport ke: {output_path}")

# Export list features agar Node.js tahu urutan array-nya
with open(r'c:\Abjadin\backend\scripts\features.txt', 'w') as f:
    f.write(','.join(features))
