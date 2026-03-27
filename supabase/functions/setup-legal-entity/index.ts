import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const {
      tenant_id,
      user_id,
      company_name,
      registration_number,
      is_vat_registered,
      vat_number,
      contact_number,
      email_address,
      website,
      directors,
      street_address,
      suburb,
      city,
      province,
      postal_code,
      country,
      bank_id,
      bank_account_type_id,
      account_holder,
      account_number,
    } = body;

    if (!tenant_id || !company_name?.trim()) {
      return new Response(
        JSON.stringify({ error: "tenant_id and company_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify tenant exists
    const { data: tenant } = await admin
      .from("tenants")
      .select("id, name")
      .eq("id", tenant_id)
      .single();

    if (!tenant) {
      return new Response(
        JSON.stringify({ error: "Tenant not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Find the Legal Entity account type
    const { data: legalEntityType } = await admin
      .from("entity_account_types")
      .select("id, prefix, number_count")
      .eq("tenant_id", tenant_id)
      .eq("account_type", 6)
      .maybeSingle();

    if (!legalEntityType) {
      return new Response(
        JSON.stringify({ error: "Legal Entity account type not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Find entity category
    const { data: entityCategory } = await admin
      .from("entity_categories")
      .select("id")
      .eq("entity_type", "legal_entity")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    // 3. Create the legal entity
    const { data: entity, error: entityError } = await admin
      .from("entities")
      .insert({
        tenant_id,
        name: company_name.trim(),
        registration_number: registration_number?.trim() || null,
        is_vat_registered: is_vat_registered || false,
        vat_number: is_vat_registered ? vat_number?.trim() : null,
        contact_number: contact_number?.trim() || null,
        email_address: email_address?.trim() || null,
        website: website?.trim() || null,
        entity_category_id: entityCategory?.id || null,
        is_active: true,
        is_registration_complete: true,
        creator_user_id: user_id || null,
      })
      .select()
      .single();

    if (entityError) throw entityError;

    // 4. Create entity account
    const prefix = legalEntityType.prefix || "LE";
    const numCount = legalEntityType.number_count || 5;
    const accountNum = `${prefix}${"1".padStart(numCount, "0")}`;

    const { error: accountError } = await admin
      .from("entity_accounts")
      .insert({
        tenant_id,
        entity_id: entity.id,
        entity_account_type_id: legalEntityType.id,
        account_number: accountNum,
        is_active: true,
        is_approved: true,
        status: "active",
      });

    if (accountError) {
      console.warn("Entity account error:", accountError.message);
    }

    // 5. Create address if provided
    if (street_address?.trim() && city?.trim()) {
      const { error: addrErr } = await admin.from("addresses").insert({
        tenant_id,
        entity_id: entity.id,
        street_address: street_address.trim(),
        suburb: suburb?.trim() || null,
        city: city.trim(),
        province: province?.trim() || null,
        postal_code: postal_code?.trim() || null,
        country: country?.trim() || "South Africa",
        address_type: "physical",
        is_primary: true,
      });
      if (addrErr) console.warn("Address error:", addrErr.message);
    }

    // 6. Create bank details if provided
    if (bank_id && bank_account_type_id && account_number?.trim()) {
      const { error: bankErr } = await admin.from("entity_bank_details").insert({
        tenant_id,
        entity_id: entity.id,
        bank_id,
        bank_account_type_id,
        account_holder: account_holder?.trim() || company_name.trim(),
        account_number: account_number.trim(),
        is_active: true,
      });
      if (bankErr) console.warn("Bank details error:", bankErr.message);
    }

    // 7. Update tenant_configuration with legal_entity_id
    await admin
      .from("tenant_configuration")
      .update({
        legal_entity_id: entity.id,
        vat_number: is_vat_registered ? vat_number?.trim() : null,
        directors: directors?.trim() || null,
      })
      .eq("tenant_id", tenant_id);

    // 8. If user_id provided, create user_entity_relationship
    if (user_id) {
      const { data: relType } = await admin
        .from("relationship_types")
        .select("id")
        .eq("name", "Authorised Representative")
        .eq("is_active", true)
        .maybeSingle();

      if (relType) {
        await admin.from("user_entity_relationships").insert({
          tenant_id,
          user_id,
          entity_id: entity.id,
          relationship_type_id: relType.id,
          is_active: true,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, entity_id: entity.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Setup legal entity error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
