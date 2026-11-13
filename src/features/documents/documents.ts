import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { api } from '@/api';
import { completeDocument, DOCUMENTS_BUCKET, MAX_UPLOAD_BYTES, startDocumentUpload, UPLOAD_TYPES, type UploadType } from '@/api/endpoints/driver';
import { supabase } from '@/lib/supabase';

// Document capture and upload (docs/spec/04-integration.md §8.2). Photos are shrunk to ~2000 px JPEG before upload so
// they stay well under the 10 MB limit on a slow connection; PDFs go as they are. The file goes straight to storage
// with a one-time signed URL from rider-admin, then rider-admin is told it is complete.

export const DOCUMENT_TYPES = {
  driver: ['national_id', 'driving_licence', 'profile_photo'],
  vehicle: ['vehicle_registration', 'fitness_certificate', 'tax_token', 'insurance', 'route_permit'],
} as const;

export type PickedFile = { uri: string; type: UploadType; size: number; name: string };

export class UploadProblem extends Error {
  constructor(readonly kind: 'too_big' | 'wrong_type' | 'cancelled') {
    super(kind);
  }
}

async function shrink(uri: string): Promise<PickedFile> {
  const out = await manipulateAsync(uri, [{ resize: { width: 2000 } }], { compress: 0.8, format: SaveFormat.JPEG });
  const blob = await (await fetch(out.uri)).blob();
  return { uri: out.uri, type: 'image/jpeg', size: blob.size, name: 'photo.jpg' };
}

export async function takePhoto(): Promise<PickedFile> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new UploadProblem('cancelled');
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
  if (res.canceled || !res.assets[0]) throw new UploadProblem('cancelled');
  return shrink(res.assets[0].uri);
}

export async function pickFile(): Promise<PickedFile> {
  const res = await DocumentPicker.getDocumentAsync({ type: [...UPLOAD_TYPES], copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets[0]) throw new UploadProblem('cancelled');
  const asset = res.assets[0];
  const mime = asset.mimeType ?? '';
  if (!(UPLOAD_TYPES as readonly string[]).includes(mime)) throw new UploadProblem('wrong_type');
  if (mime !== 'application/pdf') return shrink(asset.uri);
  if ((asset.size ?? 0) > MAX_UPLOAD_BYTES) throw new UploadProblem('too_big');
  return { uri: asset.uri, type: 'application/pdf', size: asset.size ?? 0, name: asset.name };
}

export async function uploadDocument(
  file: PickedFile,
  input: { documentType: string; vehicleId?: string; documentNumber?: string; expiresAt?: string },
  keys: { start: string; complete: string },
) {
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadProblem('too_big');
  const slot = await startDocumentUpload(
    api(),
    { documentType: input.documentType, vehicleId: input.vehicleId, contentType: file.type, size: file.size },
    keys.start,
  );
  const body = await (await fetch(file.uri)).arrayBuffer();
  const { error } = await supabase()
    .storage.from(DOCUMENTS_BUCKET)
    .uploadToSignedUrl(slot.path, slot.token, body, { contentType: file.type, upsert: false });
  if (error) throw error;
  return completeDocument(api(), slot.document_id, { documentNumber: input.documentNumber, expiresAt: input.expiresAt }, keys.complete);
}
