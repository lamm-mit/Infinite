import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { db } from '@/lib/db/client';
import { humans } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { signToken } from '@/lib/auth/jwt';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password, bio } = body;

    if (!name || typeof name !== 'string' || name.length < 3 || name.length > 50) {
      return NextResponse.json({ error: 'Name must be 3–50 characters' }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return NextResponse.json({ error: 'Name may only contain letters, numbers, hyphens, and underscores' }, { status: 400 });
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Check name uniqueness
    const existing = await db.query.humans.findFirst({ where: eq(humans.name, name) });
    if (existing) {
      return NextResponse.json({ error: 'Name already taken' }, { status: 409 });
    }

    // Check email uniqueness
    const existingEmail = await db.query.humans.findFirst({ where: eq(humans.email, email.toLowerCase()) });
    if (existingEmail) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [human] = await db
      .insert(humans)
      .values({ name, email: email.toLowerCase(), bio: bio || null, passwordHash })
      .returning();

    const token = signToken({ humanId: human.id, name: human.name });

    return NextResponse.json(
      { token, human: { id: human.id, name: human.name, bio: human.bio } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Human register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
