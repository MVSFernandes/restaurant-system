// ============================================================================
// Repository de USERS — Supabase (migração Prisma → Supabase concluída)
// ============================================================================

import { supabase } from '../lib/supabase';
import { User } from '../types/domain';
import { mapSupabaseError } from '../middlewares/errorHandler.middleware';
import {
  toUserDomain,
  toUserInsert,
  toUserUpdate,
} from '../mappers/user.mapper';
import { NotFoundError } from '../types/errors';

const TABLE = 'users';

export const userRepository = {
  async findAll(): Promise<User[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('name', { ascending: true });

    if (error) throw mapSupabaseError(error, { entity: 'User' });
    return (data ?? []).map(toUserDomain);
  },

  async findById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'User' });
    return data ? toUserDomain(data) : null;
  },

  async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'User', field: 'email' });
    return data ? toUserDomain(data) : null;
  },

  async create(user: User): Promise<User> {
    const payload = toUserInsert(user);
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();

    if (error) throw mapSupabaseError(error, { entity: 'User', field: 'email' });
    return toUserDomain(data);
  },

  async update(id: string, patch: Partial<User>): Promise<User> {
    const payload = toUserUpdate(patch);

    if (Object.keys(payload).length === 0) {
      const current = await this.findById(id);
      if (!current) throw new NotFoundError('User', id);
      return current;
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'User', field: 'email' });
    if (!data) throw new NotFoundError('User', id);

    return toUserDomain(data);
  },

  async delete(id: string): Promise<void> {
    const { error, count } = await supabase
      .from(TABLE)
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) throw mapSupabaseError(error, { entity: 'User' });
    if (count === 0) throw new NotFoundError('User', id);
  },
};