import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

try {
  const app = mount(App, { target: document.getElementById("app")! });
} catch (e) {
  console.error("Failed to mount App:", e);
  document.getElementById("app")!.innerHTML = `<pre style="color:red;padding:20px">${e}</pre>`;
}
