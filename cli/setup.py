from setuptools import setup, find_packages

setup(
    name="webscraper-pro-cli",
    version="0.8.0",
    description="CLI companion for WebScraper Pro Firefox extension",
    long_description=open("../README.md", encoding="utf-8").read() if __import__("os").path.exists("../README.md") else "",
    long_description_content_type="text/markdown",
    author="WebScraper Pro Team",
    url="https://github.com/minerofthesoal/Scraper",
    packages=find_packages(),
    py_modules=["scrape"],
    install_requires=[
        "requests>=2.28.0",
        "beautifulsoup4>=4.11.0",
        "huggingface-hub>=0.14.0",
        "Pillow>=9.0.0",
        "pydub>=0.25.0",
        "tqdm>=4.64.0",
        "rich>=12.0.0",
        "click>=8.0.0",
    ],
    extras_require={
        "parquet": ["pyarrow>=12.0.0"],
        "ai": ["torch", "transformers"],
        "all": ["pyarrow>=12.0.0", "torch", "transformers"],
    },
    entry_points={
        "console_scripts": [
            "scrape=scrape:cli",
        ],
    },
    python_requires=">=3.10,<3.15",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: Other/Proprietary License",  # Uni-S License
        "Operating System :: OS Independent",
    ],
)
