import { supabase } from "@/integrations/supabase/client";

/**
 * Plain, customs-suitable Russian product name. Used by the wholesale item
 * popup and, as a safety net, by the packing-list export when title_ru is
 * still empty.
 */
export async function generateTitleRu(item: {
  title: string | null;
  alibaba_title?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke("translate-title-ru", {
    body: { title: item.title ?? "", alibaba_title: item.alibaba_title ?? "" },
  });
  if (error) throw new Error(error.message);
  if (data?.error || !data?.title_ru) throw new Error(data?.error || "No translation returned");
  return String(data.title_ru);
}
