// server/src/utils/pdfExtract.ts

// @ts-ignore
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// Helper function to process a single page
async function processPage(pdf: any, pageNumber: number): Promise<string> {
  try {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(" ");
    return pageText;
  } catch (error) {
    console.error(`Error processing page ${pageNumber}:`, error);
    return ""; // Return empty string for failed pages
  }
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // Convert Buffer to Uint8Array as required by pdfjs-dist
    const uint8Array = new Uint8Array(buffer);
    const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
    const numPages = pdf.numPages;
    
    // Process all pages in parallel for better performance
    const pagePromises: Promise<string>[] = [];
    
    for (let i = 1; i <= numPages; i++) {
      pagePromises.push(processPage(pdf, i));
    }
    
    // Wait for all pages to be processed
    const pageTexts = await Promise.all(pagePromises);
    
    // Combine all page texts with proper spacing
    const fullText = pageTexts.join("\n").trim();
    
    if (!fullText) {
      throw new Error("No text could be extracted from the PDF");
    }
    
    return fullText;
  } catch (error) {
    console.error("PDF extraction error:", error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
