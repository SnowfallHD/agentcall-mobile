import { registerRootComponent } from 'expo';
import { registerGlobals } from '@livekit/react-native';

import App from './App';

// LiveKit React Native requires WebRTC globals before any room/client usage.
registerGlobals();

registerRootComponent(App);
