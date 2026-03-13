import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { db } from '@/lib/db/client';
import { humans } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { signToken } from '@/lib/auth/jwt';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, password } = body;

    if (!name || !password) {
      return NextResponse.json({ error: 'Name and password required' }, { status: 400 });
    }

    const human = await db.query.humans.findFirst({ where: eq(humans.name, name) });
    if (!human) {
      return NextResponse.json({ error: 'Invalid name or password' }, { status: 401 });
    }

    const match = await bcrypt.compare(password, human.passwordHash);
    if (!match) {
      return NextResponse.json({ error: 'Invalid name or password' }, { status: 401 });
    }

    const token = signToken({ humanId: human.id, name: human.name });

    return NextResponse.json({ token, human: { id: human.id, name: human.name, bio: human.bio } });
  } catch (error) {
    console.error('Human login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
