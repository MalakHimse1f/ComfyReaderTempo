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
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      throw new Error("No file uploaded");
    }

    // Validate file type
    const validTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    if (!validTypes.includes(file.type)) {
      throw new Error(
        "Invalid file type. Only PDF, DOC, DOCX, and TXT files are allowed.",
      );
    }

    // Generate a unique file path
    const timestamp = Date.now();
    const fileExt = file.name.split(".").pop();
    const filePath = `documents/${user.id}/${timestamp}-${file.name}`;

    // Upload file to storage
    const { data: uploadData, error: uploadError } =
      await supabaseClient.storage.from("documents").upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Error uploading file: ${uploadError.message}`);
    }

    // Get the public URL for the file
    const {
      data: { publicUrl },
    } = supabaseClient.storage.from("documents").getPublicUrl(filePath);

    // Create a record in the documents table
    const { data: documentData, error: documentError } = await supabaseClient
      .from("documents")
      .insert({
        user_id: user.id,
        title: file.name,
        file_type: fileExt || "unknown",
        file_size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        file_path: filePath,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (documentError) {
      throw new Error(
        `Error creating document record: ${documentError.message}`,
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        document: documentData,
        url: publicUrl,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error processing upload:", error);
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
