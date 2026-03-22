#!/usr/bin/env node
/**
 * 로컬 수동 수집 — runCollectDaily를 직접 호출
 * tsx로 TS import 지원
 * 
 * 사용법: npx tsx scripts/local-collect.mjs 2026-03-17 2026-03-18 2026-03-19 2026-03-20
 */

// 이건 ESM이지만 tsx가 TS 임포트 처리
// → 대신 순수 Node.js + Supabase + Meta API 직접 호출로 구현

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const META_TOKEN = process.env.META_ACCESS_TOKEN;

if (!SUPABASE_URL || !SUPABASE_KEY || !META_TOKEN) {
  console.error('❌ 환경변수 누락');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const AD_FIELDS = [
  "id","name","adset_id","adset_name","campaign_id","campaign_name",
  "account_id","account_name",
  "creative{object_type,product_set_id,video_id,image_hash,asset_feed_spec}"
].join(",");

const INSIGHT_FIELDS = [
  "spend","impressions","clicks","ctr","reach",
  "actions","action_values",
  "video_thruplay_watched_actions","video_p100_watched_actions",
  "quality_ranking","engagement_rate_ranking","conversion_rate_ranking"
].join(",");

function safeFloat(v, def = 0) {
  if (v == null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function getActionValue(actions, type) {
  if (!Array.isArray(actions)) return 0;
  const a = actions.find(a => a.action_type === type);
  return a ? safeFloat(a.value) : 0;
}

async function fetchAccountAds(accountId, date) {
  const url = new URL(`https://graph.facebook.com/v22.0/act_${accountId}/ads`);
  url.searchParams.set("access_token", META_TOKEN);
  url.searchParams.set("fields", `${AD_FIELDS},insights.fields(${INSIGHT_FIELDS}).time_range({"since":"${date}","until":"${date}"})`);
  url.searchParams.set("filtering", JSON.stringify([{"field":"ad.effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]));
  url.searchParams.set("limit", "100");

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString());
    if (res.status === 429) {
      const wait = (attempt + 1) * 10000;
      console.log(`  ⏳ Rate limited [${accountId}], ${wait/1000}s 대기...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Meta API ${res.status}: ${text.substring(0, 200)}`);
    }
    const data = await res.json();
    return (data.data || []).filter(ad => ad.insights?.data?.length > 0);
  }
  return [];
}

function getCreativeType(ad) {
  const creative = ad.creative;
  if (!creative) return "UNKNOWN";
  if (creative.video_id) return "VIDEO";
  if (creative.object_type === "SHARE" && creative.video_id) return "VIDEO";
  if (creative.product_set_id) return "CATALOG";
  if (creative.asset_feed_spec) return "DYNAMIC";
  if (creative.image_hash) return "IMAGE";
  return creative.object_type || "UNKNOWN";
}

function normalizeRanking(r) {
  if (!r || r === "UNKNOWN" || r === "") return "UNKNOWN";
  return r;
}

function calculateMetrics(insight) {
  const spend = safeFloat(insight.spend);
  const impressions = safeFloat(insight.impressions);
  const reach = safeFloat(insight.reach);
  const clicks = safeFloat(insight.clicks);
  
  const actions = insight.actions || [];
  const actionValues = insight.action_values || [];
  
  const purchases = getActionValue(actions, "purchase") + getActionValue(actions, "omni_purchase");
  const purchaseValue = getActionValue(actionValues, "purchase") + getActionValue(actionValues, "omni_purchase");
  const addToCart = getActionValue(actions, "add_to_cart");
  const initiateCheckout = getActionValue(actions, "initiate_checkout");
  
  const videoThruplay = getActionValue(insight.video_thruplay_watched_actions || [], "video_view");
  const videoP100 = getActionValue(insight.video_p100_watched_actions || [], "video_view");
  const videoP3s = getActionValue(actions, "video_view");
  
  const imp10k = impressions > 0 ? 10000 / impressions : 0;
  const reactions = getActionValue(actions, "post_reaction");
  const comments = getActionValue(actions, "comment");
  const shares = getActionValue(actions, "post");
  const saves = getActionValue(actions, "onsite_conversion.post_save");
  
  return {
    spend: Math.round(spend),
    impressions: Math.round(impressions),
    reach: Math.round(reach),
    clicks: Math.round(clicks),
    purchases: Math.round(purchases),
    purchase_value: Math.round(purchaseValue),
    add_to_cart: Math.round(addToCart),
    initiate_checkout: Math.round(initiateCheckout),
    roas: spend > 0 ? Math.round((purchaseValue / spend) * 10000) / 10000 : 0,
    ctr: impressions > 0 ? Math.round((clicks / impressions) * 100000) / 1000 : 0,
    video_p3s_rate: impressions > 0 ? Math.round((videoP3s / impressions) * 10000) / 100 : 0,
    thruplay_rate: impressions > 0 ? Math.round((videoThruplay / impressions) * 10000) / 100 : 0,
    retention_rate: videoP3s > 0 ? Math.round((videoP100 / videoP3s) * 10000) / 100 : 0,
    video_p100: Math.round(videoP100),
    reach_to_purchase_rate: reach > 0 ? Math.round((purchases / reach) * 100000) / 1000 : 0,
    click_to_cart_rate: clicks > 0 ? Math.round((addToCart / clicks) * 10000) / 100 : 0,
    click_to_checkout_rate: clicks > 0 ? Math.round((initiateCheckout / clicks) * 10000) / 100 : 0,
    click_to_purchase_rate: clicks > 0 ? Math.round((purchases / clicks) * 10000) / 100 : 0,
    cart_to_purchase_rate: addToCart > 0 ? Math.round((purchases / addToCart) * 10000) / 100 : 0,
    checkout_to_purchase_rate: initiateCheckout > 0 ? Math.round((purchases / initiateCheckout) * 10000) / 100 : 0,
    reactions_per_10k: Math.round(reactions * imp10k * 10) / 10,
    comments_per_10k: Math.round(comments * imp10k * 10) / 10,
    shares_per_10k: Math.round(shares * imp10k * 10) / 10,
    saves_per_10k: Math.round(saves * imp10k * 10) / 10,
    engagement_per_10k: Math.round((reactions + comments + shares + saves) * imp10k * 10) / 10,
  };
}

async function collectDate(date) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📦 ${date} 수집 시작`);
  console.log(`${'='.repeat(50)}`);
  
  const { data: accounts } = await sb.from("ad_accounts")
    .select("account_id, account_name")
    .eq("active", true)
    .order("created_at");
  
  if (!accounts?.length) { console.log("활성 계정 없음"); return; }
  console.log(`활성 계정: ${accounts.length}개`);
  
  let totalAds = 0;
  let successAccounts = 0;
  let errorAccounts = 0;
  
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    const cleanId = acc.account_id.replace(/^act_/, "");
    
    try {
      const ads = await fetchAccountAds(cleanId, date);
      
      if (ads.length > 0) {
        const rows = ads.map(ad => {
          const insight = ad.insights.data[0];
          const metrics = calculateMetrics(insight);
          const creativeType = getCreativeType(ad);
          
          return {
            date,
            account_id: cleanId,
            account_name: acc.account_name,
            campaign_id: ad.campaign_id ?? null,
            campaign_name: ad.campaign_name ?? null,
            adset_id: ad.adset_id ?? null,
            adset_name: ad.adset_name ?? null,
            ad_id: ad.id,
            ad_name: ad.name ?? null,
            creative_type: creativeType,
            quality_ranking: normalizeRanking(insight.quality_ranking),
            engagement_ranking: normalizeRanking(insight.engagement_rate_ranking),
            conversion_ranking: normalizeRanking(insight.conversion_rate_ranking),
            ...metrics,
            collected_at: new Date().toISOString(),
          };
        });
        
        const { error: insertErr } = await sb
          .from("daily_ad_insights")
          .upsert(rows, { onConflict: "account_id,date,ad_id" });
        
        if (insertErr) {
          console.error(`  ❌ [${i+1}/${accounts.length}] ${acc.account_name}: DB 에러 — ${insertErr.message}`);
          errorAccounts++;
        } else {
          console.log(`  ✅ [${i+1}/${accounts.length}] ${acc.account_name}: ${rows.length}건`);
          totalAds += rows.length;
          successAccounts++;
        }
      } else {
        console.log(`  ⏭️ [${i+1}/${accounts.length}] ${acc.account_name}: 0건 (데이터 없음)`);
        successAccounts++;
      }
    } catch (e) {
      console.error(`  ❌ [${i+1}/${accounts.length}] ${acc.account_name}: ${e.message?.substring(0, 100)}`);
      errorAccounts++;
    }
    
    // Meta API rate limit 대응
    await sleep(500);
  }
  
  console.log(`\n📊 ${date} 결과: ${successAccounts}/${accounts.length} 성공, ${totalAds}건 광고, ${errorAccounts}건 에러`);
}

// 메인
const dates = process.argv.slice(2);
if (dates.length === 0) {
  console.error('사용법: node scripts/local-collect.mjs 2026-03-17 2026-03-18 2026-03-19 2026-03-20');
  process.exit(1);
}

console.log(`🔄 수동 수집: ${dates.join(', ')}`);
console.log(`   Meta API Token: ${META_TOKEN?.substring(0, 10)}...`);

for (const date of dates) {
  await collectDate(date);
}

console.log('\n🏁 전체 수집 완료');
