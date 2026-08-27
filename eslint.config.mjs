import nextConfig from "eslint-config-next/core-web-vitals";
import nextTypescriptConfig from "eslint-config-next/typescript";

const config = [...nextConfig, ...nextTypescriptConfig];

export default config;
