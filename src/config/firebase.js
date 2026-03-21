import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

// Configuración de tu proyecto Firebase
const firebaseConfig = {
  apiKey: 'AIzaSyCjqbJrkJ55OV2osEDGqfv436tN7D7-1lY',
  authDomain: 'trading-dashboard-478e9.firebaseapp.com',
  projectId: 'trading-dashboard-478e9',
  storageBucket: 'trading-dashboard-478e9.firebasestorage.app',
  messagingSenderId: '1003506767953',
  appId: '1:1003506767953:web:b9ccc4144e91e0090cc070'
}

const app = initializeApp(firebaseConfig)

// Base de datos Firestore
export const db = getFirestore(app)

// Autenticación
export const auth = getAuth(app)

// Proveedor de Google para el login
export const googleProvider = new GoogleAuthProvider()
