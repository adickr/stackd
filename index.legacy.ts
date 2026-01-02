import { registerRootComponent } from 'expo';

import * as AppModule from "./App";
const App = (AppModule as any).default ?? (AppModule as any).App;
export default App;


// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
