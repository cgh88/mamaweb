import { getUser } from '@/lib/auth';
import { recipeLines } from '@/lib/inventory';

export const dynamic = 'force-dynamic';

/** 레시피 불러오기용: ?m=base64url([분류, 표준명]) → 줄 목록 */
export async function GET(req) {
  const user = await getUser();
  if (!user || user.must_change) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const [category, stdName] = JSON.parse(Buffer.from(new URL(req.url).searchParams.get('m') || '', 'base64url').toString());
    const lines = await recipeLines(String(category), String(stdName));
    return Response.json(lines.map((l) => ({ ingredient_id: l.ingredient_id, qty: l.qty })));
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }
}
