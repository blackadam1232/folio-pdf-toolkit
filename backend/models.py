from typing import Literal
from pydantic import BaseModel, Field, ConfigDict

Tool = Literal[
    "images",
    "merge",
    "extract",
    "split",
    "organize",
    "render",
    "compress",
    "numbers",
    "watermark",
    "protect",
    "unlock",
]


class PageEdit(BaseModel):
    page: int = Field(ge=1)
    rotation: Literal[0, 90, 180, 270] = 0


class Options(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page_size: Literal["A4", "Letter", "Original"] = "A4"
    orientation: Literal["Auto", "Portrait", "Landscape"] = "Auto"
    fit: Literal["Contain", "Cover", "Original"] = "Contain"
    quality: Literal["Original", "Maximum", "High", "Medium", "Small File"] = "High"
    profile: Literal["Screen/Mobile", "Print", "Original"] = "Screen/Mobile"
    margin: float = Field(default=0, ge=0, le=100, allow_inf_nan=False)
    margins: list[float] | None = None
    sort: Literal[
        "Natural filename",
        "Natural descending",
        "Filename A-Z",
        "Filename Z-A",
        "Date modified",
        "Newest first",
        "Manual",
    ] = "Natural filename"
    order: list[str] = Field(default_factory=list, max_length=20000)
    rotations: dict[str, int] = Field(default_factory=dict)
    filename: str = Field(
        default="document", min_length=1, max_length=100, pattern=r"^[\w .-]+$"
    )
    ranges: str = Field(default="", max_length=10000)
    groups: str = Field(default="", max_length=10000)
    pages: list[PageEdit] = Field(default_factory=list, max_length=20000)
    dpi: int = Field(default=120, ge=36, le=300)
    image_format: Literal["PNG", "JPEG"] = "PNG"
    compression: Literal["lossless", "lossy"] = "lossless"
    text: str = Field(default="CONFIDENTIAL", max_length=200)
    font_size: float = Field(default=24, ge=6, le=144, allow_inf_nan=False)
    opacity: float = Field(default=0.3, ge=0, le=1, allow_inf_nan=False)
    angle: float = Field(default=0, ge=-180, le=180, allow_inf_nan=False)
    color: str = Field(default="#555555", pattern=r"^#[0-9a-fA-F]{6}$")
    position: Literal[
        "top-left",
        "top-center",
        "top-right",
        "center",
        "bottom-left",
        "bottom-center",
        "bottom-right",
    ] = "bottom-center"
    start_number: int = Field(default=1, ge=0, le=1000000)
    numbering: Literal["number", "Page X of Y"] = "Page X of Y"


class NewJob(BaseModel):
    tool: Tool = "images"


class SaveOptions(BaseModel):
    options: Options


class Start(BaseModel):
    input_password: str = Field(default="", max_length=256)
    output_password: str = Field(default="", max_length=256)


def validated(options):
    import math

    if options.margins is not None:
        if len(options.margins) != 4 or any(
            not math.isfinite(v) or v < 0 or v > 100 for v in options.margins
        ):
            raise ValueError("Use four finite margins between 0 and 100 mm")
    if any(v not in (0, 90, 180, 270) for v in options.rotations.values()):
        raise ValueError("Rotation must be 0, 90, 180 or 270")
    return options.model_dump()
