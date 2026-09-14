import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
    build: {
        outDir: "dist",
        chunkSizeWarningLimit: 4500,
        rollupOptions: {
            input: {
                main: fileURLToPath(new URL("./index.html", import.meta.url)),
                challenges: fileURLToPath(
                    new URL("./challenges/index.html", import.meta.url),
                ),
            },
        },
    },
});
