param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $WorkbookPath -PathType Leaf)) {
  throw "Workbook tidak ditemukan: $WorkbookPath"
}

Add-Type -AssemblyName System.IO.Compression
$stream = [System.IO.File]::Open(
  $WorkbookPath,
  [System.IO.FileMode]::Open,
  [System.IO.FileAccess]::Read,
  [System.IO.FileShare]::ReadWrite
)
$zip = $null

function Read-ZipEntryText($archive, [string]$entryName) {
  $entry = $archive.GetEntry($entryName)
  if (-not $entry) {
    return $null
  }

  $reader = New-Object System.IO.StreamReader($entry.Open())
  try {
    return $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }
}

function Get-CellText($cell, $sharedStrings) {
  $valueNode = $cell.SelectSingleNode("./*[local-name()='v']")
  if ($cell.GetAttribute("t") -eq "s" -and $valueNode) {
    return [string]$sharedStrings[[int]$valueNode.InnerText]
  }
  if ($cell.GetAttribute("t") -eq "inlineStr") {
    return [string]$cell.InnerText
  }
  if ($valueNode) {
    return [string]$valueNode.InnerText
  }
  return ""
}

function Get-CellValue($cells, [string]$column) {
  if ($cells.Contains($column)) {
    return [string]$cells[$column]
  }
  return ""
}

try {
  $zip = New-Object System.IO.Compression.ZipArchive(
    $stream,
    [System.IO.Compression.ZipArchiveMode]::Read,
    $true
  )

  $sharedStrings = @()
  $sharedStringsXml = Read-ZipEntryText $zip "xl/sharedStrings.xml"
  if ($sharedStringsXml) {
    [xml]$sharedStringsDocument = $sharedStringsXml
    $sharedStrings = @(
      $sharedStringsDocument.SelectNodes("//*[local-name()='si']") |
        ForEach-Object { $_.InnerText }
    )
  }

  [xml]$workbook = Read-ZipEntryText $zip "xl/workbook.xml"
  [xml]$relationships = Read-ZipEntryText $zip "xl/_rels/workbook.xml.rels"
  $sheets = New-Object System.Collections.Generic.List[object]
  $unexpectedRows = New-Object System.Collections.Generic.List[string]
  $sheetIndex = 0

  foreach ($sheet in $workbook.SelectNodes("//*[local-name()='sheets']/*[local-name()='sheet']")) {
    $sheetIndex++
    $relationshipId = $sheet.GetAttribute(
      "id",
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    )
    $relationship = $relationships.SelectSingleNode(
      "//*[local-name()='Relationship'][@Id='$relationshipId']"
    )
    if (-not $relationship) {
      throw "Relasi worksheet tidak ditemukan untuk tab $($sheet.GetAttribute('name'))."
    }

    $target = [Uri]::UnescapeDataString($relationship.GetAttribute("Target"))
    $segments = New-Object System.Collections.Generic.List[string]
    if (-not $target.StartsWith("/")) {
      $segments.Add("xl")
    }
    foreach ($segment in ($target.TrimStart("/") -split "/")) {
      if (-not $segment -or $segment -eq ".") {
        continue
      }
      if ($segment -eq "..") {
        if ($segments.Count -gt 0) {
          $segments.RemoveAt($segments.Count - 1)
        }
        continue
      }
      $segments.Add($segment)
    }
    $worksheetPath = $segments -join "/"
    [xml]$worksheet = Read-ZipEntryText $zip $worksheetPath
    if (-not $worksheet) {
      throw "Isi worksheet tidak ditemukan: $worksheetPath"
    }

    $sourceRows = New-Object System.Collections.Generic.List[object]
    $items = New-Object System.Collections.Generic.List[object]
    $category = ""
    $period = ""
    $roomName = ""
    $roomCode = ""

    foreach ($row in $worksheet.SelectNodes("//*[local-name()='sheetData']/*[local-name()='row']")) {
      $rowNumber = [int]$row.GetAttribute("r")
      $cells = [ordered]@{}

      foreach ($cell in $row.SelectNodes("./*[local-name()='c']")) {
        $column = $cell.GetAttribute("r") -replace "\d", ""
        $text = Get-CellText $cell $sharedStrings
        if ($text -ne "") {
          $cells[$column] = $text
        }
      }

      if ($cells.Count -eq 0) {
        continue
      }

      $sourceRows.Add([ordered]@{
        row   = $rowNumber
        cells = $cells
      })

      if ($rowNumber -eq 1) {
        $period = (Get-CellValue $cells "C") -replace "^\s*:\s*", ""
        $period = $period.Trim()
      }
      if ($rowNumber -eq 8) {
        $roomName = (Get-CellValue $cells "C") -replace "^\s*:\s*", ""
        $roomName = $roomName.Trim()
      }
      if ($rowNumber -eq 9) {
        $roomCode = (Get-CellValue $cells "H") -replace "^\s*:\s*", ""
        $roomCode = $roomCode.Trim()
      }

      $sourceNumber = (Get-CellValue $cells "A").Trim()
      $name = (Get-CellValue $cells "B").Trim()
      if ($rowNumber -ge 15 -and $sourceNumber -match "^\d+(?:\.\d+)?\.?$" -and $name) {
        if (-not $category) {
          $unexpectedRows.Add("$($sheet.GetAttribute('name')) row $rowNumber has no category heading.")
        }
        $items.Add([ordered]@{
          source_row        = $rowNumber
          nomor_urut        = $sourceNumber
          nama_barang       = $name
          nomor_barang      = (Get-CellValue $cells "C").Trim()
          register          = (Get-CellValue $cells "D").Trim()
          merk_model        = (Get-CellValue $cells "E").Trim()
          no_seri_pabrik    = (Get-CellValue $cells "F").Trim()
          ukuran            = (Get-CellValue $cells "G").Trim()
          bahan             = (Get-CellValue $cells "H").Trim()
          warna             = (Get-CellValue $cells "I").Trim()
          tahun_pembuatan   = (Get-CellValue $cells "J").Trim()
          keadaan           = (Get-CellValue $cells "K").Trim()
          jumlah_barang     = (Get-CellValue $cells "L").Trim()
          kebutuhan_riil    = (Get-CellValue $cells "M").Trim()
          keterangan        = (Get-CellValue $cells "N").Trim()
          kategori          = $category
        })
      } elseif ($rowNumber -ge 15 -and $name -and $name -notmatch "\.{3,}" -and $name -notin @("Mengetahui,", "Penanggung Jawab Ruangan") -and $sourceNumber -notmatch "^\d+(?:\.\d+)?\.?$" -and (Get-CellValue $cells "A") -notmatch "^\s*ALAT") {
        $unexpectedRows.Add("$($sheet.GetAttribute('name')) row $rowNumber has unnumbered content: $name")
      }

      $categoryCell = (Get-CellValue $cells "A").Trim()
      if ($rowNumber -ge 15 -and $categoryCell -match "^ALAT(?:\s|$)") {
        $category = $categoryCell
      }
    }

    $state = $sheet.GetAttribute("state")
    if (-not $state) {
      $state = "visible"
    }
    $sheets.Add([ordered]@{
      source_sheet_index = $sheetIndex
      source_sheet       = $sheet.GetAttribute("name")
      sheet_state        = $state
      nama_ruang         = $roomName
      kode_ruang         = $roomCode
      periode_kartu      = $period
      source_rows        = $sourceRows.ToArray()
      items              = $items.ToArray()
    })
  }

  if ($unexpectedRows.Count -gt 0) {
    throw "Ditemukan baris inventaris yang perlu diperiksa:`n$($unexpectedRows -join "`n")"
  }

  $seed = [ordered]@{
    source_file = [System.IO.Path]::GetFileName($WorkbookPath)
    sheets      = $sheets.ToArray()
  }
  $json = ConvertTo-Json -InputObject $seed -Depth 30 -Compress
  $outputDirectory = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($OutputPath))
  if (-not (Test-Path -LiteralPath $outputDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  }
  [System.IO.File]::WriteAllText(
    [System.IO.Path]::GetFullPath($OutputPath),
    $json,
    (New-Object System.Text.UTF8Encoding($false))
  )

  $totalItems = 0
  $categoryCounts = @{}
  foreach ($sheetData in $sheets) {
    $totalItems += $sheetData.items.Count
    foreach ($item in $sheetData.items) {
      if (-not $categoryCounts.ContainsKey($item.kategori)) {
        $categoryCounts[$item.kategori] = 0
      }
      $categoryCounts[$item.kategori]++
    }
  }
  Write-Output ("Sheets: {0}; inventory rows: {1}" -f $sheets.Count, $totalItems)
  $categoryCounts.GetEnumerator() | Sort-Object Name | ForEach-Object {
    Write-Output ("{0}: {1}" -f $_.Name, $_.Value)
  }
  Write-Output "Seed: $([System.IO.Path]::GetFullPath($OutputPath))"
} finally {
  if ($zip) {
    $zip.Dispose()
  }
  $stream.Dispose()
}
