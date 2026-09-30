#!/usr/bin/env python3
"""
Python OpenPyXL Report Exporter Utility with A3 Logo Bounding Box Debugging
and Alpha Transparency Flattening for Excel Compatibility.
"""

import os
import sys
try:
    from openpyxl import Workbook
    from openpyxl.drawing.image import Image as XLImage
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    from PIL import Image as PILImage
except ImportError:
    print("Required packages (openpyxl, pillow) not installed. Install via: pip install openpyxl pillow")
    sys.exit(1)

def ensure_compatible_logo(input_image_path, output_image_path="temp_logo_clean.png"):
    """
    Utility function that receives a logo image, forcibly converts it to PNG format
    with a solid white background without transparent alpha channel, and saves it
    as temp_logo_clean.png before openpyxl reads it.
    """
    if not os.path.exists(input_image_path):
        print(f"[DEBUG] ensure_compatible_logo: Logo source not found at {input_image_path}")
        return None

    try:
        with PILImage.open(input_image_path) as img:
            # Force conversion to RGB by pasting onto solid white background
            background = PILImage.new("RGB", img.size, (255, 255, 255))
            if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                if img.mode == "P":
                    img = img.convert("RGBA")
                background.paste(img, mask=img.split()[3] if len(img.split()) > 3 else None)
            else:
                background.paste(img)

            # Resize to 60x60 px for cell A3:A5 proportion
            processed = background.resize((60, 60), PILImage.Resampling.LANCZOS)
            processed.save(output_image_path, "PNG")
            print(f"[DEBUG] ensure_compatible_logo: Saved clean PNG to {output_image_path} (60x60px, solid white background, no alpha).")
            return output_image_path
    except Exception as e:
        print(f"[DEBUG] ensure_compatible_logo error: {e}")
        return None

def debug_print_bounding_box(ws, cell_coord="A3"):
    """
    Debug utility that prints the bounding box coordinates and cell properties 
    before ws.add_image is called.
    """
    cell = ws[cell_coord]
    print("=" * 60)
    print(f"[DEBUG] Bounding Box & Cell Inspection for coordinate: {cell_coord}")
    print(f"  - Cell Coordinate: {cell.coordinate}")
    print(f"  - Row Index: {cell.row}")
    print(f"  - Column Index: {cell.column}")
    print(f"  - Merged Cell Ranges in Sheet: {[str(range_obj) for range_obj in ws.merged_cells.ranges]}")
    print("=" * 60)

def generate_excel_report_python(output_filename="laporan_operasional.xlsx", logo_path="Logo_Kementerian_Haji_dan_Umrah.png"):
    wb = Workbook()
    ws = wb.active
    ws.title = "Laporan Operasional"

    # Ensure gridlines are visible
    ws.views.sheetView[0].showGridLines = True

    # Setup column widths
    ws.column_dimensions['A'].width = 12 # Logo square column (~60px)
    for col in ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']:
        ws.column_dimensions[col].width = 18

    # Row heights
    ws.row_dimensions[3].height = 24
    ws.row_dimensions[4].height = 18
    ws.row_dimensions[5].height = 20

    # Merge Header cells without colliding with A3:A5
    ws.merge_cells("B3:H3")
    ws.merge_cells("B4:H4")
    ws.merge_cells("B5:H5")
    ws.merge_cells("I3:M3")
    ws.merge_cells("I4:M4")
    ws.merge_cells("I5:M5")
    ws.merge_cells("A3:A5") # Logo block

    # Header content
    ws['B3'] = "ASRAMA HAJI JAKARTA"
    ws['B4'] = "KEMENTERIAN HAJI DAN UMRAH REPUBLIK INDONESIA"
    ws['B5'] = "Sistem Informasi Manajemen Operasional"

    ws['I3'] = "Lampiran Administrasi & Manajemen Operasional"
    ws['I4'] = "Jl. Raya Pd. Gede, RT.1/RW.1, Pinang Ranti, Jakarta Timur"
    ws['I5'] = "Email: info@asramahajijakarta.id • Telp: 0816243154"

    # DEBUG: Print bounding box before adding image
    debug_print_bounding_box(ws, "A3")

    # Ensure compatible logo (PNG format with solid white background, saved as temp_logo_clean.png)
    processed_logo = ensure_compatible_logo(logo_path)
    if processed_logo and os.path.exists(processed_logo):
        img = XLImage(processed_logo)
        img.width = 60
        img.height = 60
        ws.add_image(img, "A3")
        print("[DEBUG] Image successfully added to worksheet at coordinate A3.")
    else:
        print("[DEBUG] Fallback: Setting text emblem badge in A3:A5.")
        ws['A3'] = "EMBLEM\nKEMENHAJI"

    wb.save(output_filename)
    print(f"[DEBUG] Excel report successfully generated and saved to {output_filename}")

if __name__ == "__main__":
    generate_excel_report_python()
