import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  signOut, 
  onAuthStateChanged,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  User as FirebaseUser 
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, query, where, onSnapshot, deleteDoc, getDocFromServer } from 'firebase/firestore';

// Import the Firebase configuration
import firebaseConfig from '../../firebase-applet-config.json';

export interface AppUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

// Initialize Firebase SDK
console.log("[DEBUG] Initializing Firebase with Project ID:", firebaseConfig.projectId);
const app = initializeApp(firebaseConfig);

// Use the provided database ID if it's not the default one
const dbId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? firebaseConfig.firestoreDatabaseId
  : undefined;

export const db = dbId ? getFirestore(app, dbId) : getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const ensureUserProfile = async (user: FirebaseUser) => {
  if (!user) return;
  try {
    await setDoc(doc(db, 'users', user.uid), {
      id: user.uid,
      email: user.email || `${user.uid}@placeholder.com`,
      name: user.displayName || user.email?.split('@')[0] || 'User',
      picture: user.photoURL || ''
    }, { merge: true });
  } catch (error) {
    console.warn("Firestore profile sync notice:", error);
  }
};

// Auth functions - Email & Password + Google Auth via popup
export const signUpWithEmail = async (email: string, pass: string, name?: string): Promise<AppUser> => {
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  if (result?.user) {
    if (name) {
      await updateProfile(result.user, { displayName: name });
    }
    await ensureUserProfile(result.user);
    return {
      uid: result.user.uid,
      displayName: name || result.user.displayName || result.user.email?.split('@')[0] || 'User',
      email: result.user.email,
      photoURL: result.user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || email)}`,
    };
  }
  throw new Error("Failed to create account.");
};

export const signInWithEmail = async (email: string, pass: string): Promise<AppUser> => {
  const result = await signInWithEmailAndPassword(auth, email, pass);
  if (result?.user) {
    await ensureUserProfile(result.user);
    return {
      uid: result.user.uid,
      displayName: result.user.displayName || result.user.email?.split('@')[0] || 'User',
      email: result.user.email,
      photoURL: result.user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(result.user.displayName || email)}`,
    };
  }
  throw new Error("Failed to sign in.");
};

export const loginWithGoogle = async (): Promise<AppUser> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (result?.user) {
      await ensureUserProfile(result.user);
      return {
        uid: result.user.uid,
        displayName: result.user.displayName || result.user.email?.split('@')[0] || "Google User",
        email: result.user.email,
        photoURL: result.user.photoURL,
      };
    }
    throw new Error("No user returned from Google sign-in.");
  } catch (error: any) {
    console.error("[Auth] loginWithGoogle error:", error);
    throw error;
  }
};

export const handleAuthRedirectResult = async (): Promise<AppUser | null> => {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      await ensureUserProfile(result.user);
      return {
        uid: result.user.uid,
        displayName: result.user.displayName,
        email: result.user.email,
        photoURL: result.user.photoURL,
      };
    }
  } catch (error) {
    console.info("Redirect result notice:", error);
  }
  return null;
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.warn("Logout notice:", error);
  }
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  
  console.error('Firestore Error: ', JSON.stringify(errInfo));

  if (errorMessage.includes('Database') && errorMessage.includes('not found')) {
    console.error(`CRITICAL: The Firestore database "${firebaseConfig.firestoreDatabaseId || '(default)'}" was not found in project "${firebaseConfig.projectId}". Please verify the Project ID and Database ID in your Firebase Console.`);
  } else if (errorMessage.includes('project') && errorMessage.includes('not found')) {
    console.error(`CRITICAL: The Firebase project "${firebaseConfig.projectId}" was not found. Please check your Project ID in firebase-applet-config.json.`);
  }

  throw new Error(JSON.stringify(errInfo));
}

// Test connection
async function testConnection() {
  try {
    // Attempt to fetch a non-existent doc to test connectivity
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. Ensure the Firestore Database has been created in the Firebase Console.");
    } else if (errorMessage.includes('Database') && errorMessage.includes('not found')) {
      console.error(`CRITICAL: The Firestore database "${firebaseConfig.firestoreDatabaseId || '(default)'}" was not found in project "${firebaseConfig.projectId}". Please verify the Project ID and Database ID in your Firebase Console.`);
    } else if (errorMessage.includes('project') && errorMessage.includes('not found')) {
      console.error(`CRITICAL: The Firebase project "${firebaseConfig.projectId}" was not found. Please check your Project ID in firebase-applet-config.json.`);
    } else {
      console.warn("Firestore connection test notice (can be ignored if app works):", errorMessage);
    }
  }
}
testConnection();

export type { FirebaseUser };
