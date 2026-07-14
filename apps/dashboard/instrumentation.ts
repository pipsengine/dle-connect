export async function register() {
  // Next.js builds instrumentation for both nodejs and edge.
  // Only import Node modules inside the nodejs branch so Edge/webpack
  // does not try to bundle mssql/tedious (crypto, stream, timers, etc.).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNodeInstrumentation } = await import('./instrumentation.node');
    await registerNodeInstrumentation();
  }
}
