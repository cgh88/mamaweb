'use client';

import { useRef, useState } from 'react';
import { uploadImage } from '@/lib/adminApi';
import styles from './admin.module.css';

interface Props {
  label: string;
  value: string;
  onChange: (path: string) => void;
}

/** 이미지 경로 입력 + 파일 업로드 + 미리보기 공용 필드 */
export default function ImageField({ label, value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <label>
      {label}
      <div className={styles.imgField}>
        {value ? (
          <img src={value} alt="미리보기" className={styles.imgPreview} />
        ) : (
          <div className={styles.imgPreview} />
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            type="text"
            placeholder="/uploads/... 또는 /img/... 경로"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} />
          {uploading && <span style={{ fontSize: '0.82rem' }}>업로드 중...</span>}
          {error && <span className={styles.error}>{error}</span>}
        </div>
      </div>
    </label>
  );
}
