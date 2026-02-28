import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { setPendingImport } from '../src/utils/pendingImport';

export default function NotFound() {
  const router = useRouter();
  useEffect(() => {
    Linking.getInitialURL().then(url => {
      if (url && (url.startsWith('content://') || url.startsWith('file://'))) {
        setPendingImport(url);
      }
      router.replace('/');
    });
  }, []);
  return null;
}
