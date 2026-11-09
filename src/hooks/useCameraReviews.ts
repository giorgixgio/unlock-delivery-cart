import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
export interface CameraReview {id:string;customer_display_name:string;city:string;rating:number;text:string;photo_urls:string[];source:string;status:string;created_at:string;verified:boolean;}
export interface LandingStats {sold_units:number;today_orders:number;recent_cities:string[]}
export function useCameraReviews(preview=false) {return useQuery({queryKey:['camera-reviews',preview],queryFn:async()=>{const {data,error}=await supabase.functions.invoke('camera-reviews',{body:{action:'feed',preview}});if(error)throw error;return (data.reviews ?? []) as CameraReview[];},staleTime:60000});}
export function useCameraStats() {return useQuery({queryKey:['camera-stats'],queryFn:async()=>{const {data,error}=await supabase.rpc('camera_landing_stats');if(error)throw error;return data as unknown as LandingStats;},staleTime:60000});}
/** Same review system, filtered by product id (falls back to the current SKU for older rows). */
export function useProductReviews(productId:string,sku:string,preview=false) {return useQuery({queryKey:['camera-reviews','product',productId,sku,preview],queryFn:async()=>{const {data,error}=await supabase.functions.invoke('camera-reviews',{body:{action:'feed',preview,product_id:productId,product_sku:sku}});if(error)throw error;return (data.reviews ?? []) as CameraReview[];},staleTime:60000});}
export function useProductStats(productId:string,sku:string) {return useQuery({queryKey:['product-landing-stats',productId,sku],queryFn:async()=>{const {data,error}=await supabase.rpc('product_landing_stats',{p_sku:sku,p_product_id:productId});if(error)throw error;return data as unknown as LandingStats;},staleTime:60000});}
