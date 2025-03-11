import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Get the current user from the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) {
      throw new Error("Invalid user token");
    }

    // Parse the request body
    const { documentId, progress } = await req.json();

    if (!documentId) {
      throw new Error("Document ID is required");
    }

    if (!progress) {
      throw new Error("Progress data is required");
    }

    // Update the document with reading progress
    const { data, error } = await supabaseClient
      .from("documents")
      .update({
        reading_progress: progress,
        last_opened: new Date().toISOString(),
      })
      .eq("id", documentId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Error updating reading progress: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        document: data,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error saving reading progress:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
