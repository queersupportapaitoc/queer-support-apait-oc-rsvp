import { publicKey } from '@/lib/secrets';
import { json, route } from '@/lib/http';
export const GET = () => route(async () => json({ key: publicKey() }));
