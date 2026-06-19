import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    port: process.env.DEPLOY_RUN_PORT || '5000',
    env: process.env.COZE_PROJECT_ENV || 'DEV',
  });
}
